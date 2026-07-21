"use server";

import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser, createSession } from "@/lib/auth";
import { notifyCommissionPayout } from "@/lib/wa-notify";

// Sales/Admin membuat akun OWNER untuk sebuah toko (saat owner setuju)
export async function createOwnerAccount(storeId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") return { error: "Tidak punya akses." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!name || !phone || !password) {
    return { error: "Nama, nomor HP, dan password wajib diisi." };
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return { error: "Nomor HP sudah terdaftar." };

  const passwordHash = await bcrypt.hash(password, 10);
  const owner = await prisma.user.create({
    data: { name, phone, passwordHash, role: "OWNER", createdById: user.id },
  });

  await prisma.store.update({
    where: { id: storeId },
    data: { ownerUserId: owner.id },
  });

  revalidatePath(`/data`);
  revalidatePath(`/prospects`);
  return { ok: true };
}

// NIK KTP dari form — opsional; kalau diisi harus 16 digit dan belum
// dipakai akun lain. Return { error } kalau tidak valid.
async function parseNik(
  formData: FormData,
  excludeUserId?: string,
): Promise<{ nik?: string | null; error?: string }> {
  const nik = String(formData.get("nik") ?? "").replace(/\D/g, "");
  if (!nik) return { nik: null };
  if (nik.length !== 16) return { error: "NIK harus 16 digit angka." };
  const taken = await prisma.user.findFirst({
    where: { nik, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { name: true },
  });
  if (taken) return { error: `NIK sudah terdaftar atas nama ${taken.name}.` };
  return { nik };
}

// Titik rumah sales dari form (homeLat/homeLng) — dua-duanya harus terisi
// angka valid; selain itu dianggap tanpa titik (null).
function parseHomePoint(formData: FormData) {
  const latRaw = String(formData.get("homeLat") ?? "").trim();
  const lngRaw = String(formData.get("homeLng") ?? "").trim();
  const lat = latRaw ? Number.parseFloat(latRaw.replace(",", ".")) : NaN;
  const lng = lngRaw ? Number.parseFloat(lngRaw.replace(",", ".")) : NaN;
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { homeLat: null, homeLng: null };
  }
  return { homeLat: lat, homeLng: lng };
}

// Admin membuat akun SALES
export async function createSalesAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !phone || !password) {
    return { error: "Nama, no HP, dan password wajib diisi." };
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return { error: "Nomor HP sudah terdaftar." };

  const nikRes = await parseNik(formData);
  if (nikRes.error) return { error: nikRes.error };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      phone,
      passwordHash,
      role: "SALES",
      createdById: user.id,
      nik: nikRes.nik,
      bankAccount: String(formData.get("bankAccount") ?? "").trim() || null,
      ...parseHomePoint(formData),
    },
  });
  revalidatePath("/data");
  revalidatePath("/sales");
  return { ok: true };
}

// ===== Akun karyawan gudang (role GUDANG) =====
// Admin buatkan akun login untuk orang gudang di halaman Payroll. Mereka
// hanya bisa lihat halaman Order & catat lembur (clock-in/out).
export async function createGudangAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !phone || !password) {
    return { error: "Nama, no HP, dan password wajib diisi." };
  }
  const basePay = Math.max(0, Math.round(Number(formData.get("basePay") ?? 0)));

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return { error: "Nomor HP sudah terdaftar." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: {
      name,
      phone,
      passwordHash,
      role: "GUDANG",
      basePay,
      createdById: user.id,
      ...parseHomePoint(formData), // lokasi gudang → dasar penugasan terdekat
    },
  });
  revalidatePath("/payroll");
  revalidatePath("/data");
  return { ok: true };
}

export async function deleteGudangAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Karyawan tidak ditemukan." };
  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "GUDANG")
    return { error: "Karyawan gudang tidak ditemukan." };

  await prisma.user.delete({ where: { id } });
  revalidatePath("/payroll");
  revalidatePath("/data");
  return { ok: true };
}

// ===== Link registrasi sales (undangan sekali pakai) =====

const INVITE_DAYS = 7;

// Admin membuat link undangan /daftar-sales/[token] — dibagikan ke calon
// sales, dia isi datanya sendiri dari HP (termasuk GPS titik rumah).
export async function createSalesInvite(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  await prisma.salesInvite.create({
    data: {
      token: randomBytes(18).toString("base64url"),
      note: String(formData.get("note") ?? "").trim() || null,
      createdById: user.id,
      expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
    },
  });
  revalidatePath("/sales");
  return { ok: true };
}

// Admin menghapus / mencabut link undangan
export async function deleteSalesInvite(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  await prisma.salesInvite.delete({ where: { id } });
  revalidatePath("/sales");
  return { ok: true };
}

// Registrasi sales lewat link undangan — PUBLIK (tanpa sesi), diamankan
// token sekali-pakai. Sukses = akun SALES dibuat + langsung login.
export async function registerSalesViaInvite(
  token: string,
  formData: FormData,
) {
  const invite = await prisma.salesInvite.findUnique({ where: { token } });
  if (!invite || invite.usedAt || invite.expiresAt < new Date()) {
    return { error: "Link registrasi tidak berlaku. Minta link baru ke admin." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !phone || !password) {
    return { error: "Nama, no HP, dan password wajib diisi." };
  }
  if (password.length < 4) return { error: "Password minimal 4 karakter." };

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return { error: "Nomor HP sudah terdaftar. Coba login." };

  const nikRes = await parseNik(formData);
  if (nikRes.error) return { error: nikRes.error };

  // Klaim token dulu secara atomik (anti dobel submit / rebutan), baru
  // buat akunnya; kalau pembuatan akun gagal, klaimnya dilepas lagi.
  const claimed = await prisma.salesInvite.updateMany({
    where: { token, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (claimed.count === 0) {
    return { error: "Link registrasi baru saja terpakai. Minta link baru ke admin." };
  }

  let created;
  try {
    created = await prisma.user.create({
      data: {
        name,
        phone,
        passwordHash: await bcrypt.hash(password, 10),
        role: "SALES",
        createdById: invite.createdById,
        nik: nikRes.nik,
        bankAccount: String(formData.get("bankAccount") ?? "").trim() || null,
        ...parseHomePoint(formData),
      },
    });
    await prisma.salesInvite.update({
      where: { token },
      data: { usedById: created.id },
    });
  } catch {
    await prisma.salesInvite.updateMany({
      where: { token },
      data: { usedAt: null },
    });
    return { error: "Gagal membuat akun. Coba lagi." };
  }

  revalidatePath("/sales");
  revalidatePath("/data");
  await createSession({ userId: created.id, role: "SALES", name: created.name });
  redirect("/beranda");
}

// Admin mengubah akun SALES (password hanya diganti kalau diisi)
export async function updateSalesAccount(userId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "SALES") {
    return { error: "Akun sales tidak ditemukan." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !phone) return { error: "Nama dan nomor HP wajib diisi." };

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing && existing.id !== userId) {
    return { error: "Nomor HP sudah dipakai akun lain." };
  }

  const nikRes = await parseNik(formData, userId);
  if (nikRes.error) return { error: nikRes.error };

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
      nik: nikRes.nik,
      ...parseHomePoint(formData),
    },
  });
  revalidatePath("/data");
  revalidatePath("/sales");
  revalidatePath("/beranda");
  return { ok: true };
}

// Admin mengatur persen komisi affiliator seorang sales (dari omzet konter
// yang dia pegang) — form di halaman detail /sales/[id].
export async function setSalesCommission(userId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "SALES") {
    return { error: "Akun sales tidak ditemukan." };
  }

  const raw = String(formData.get("commissionPct") ?? "").trim();
  const pct = Number.parseFloat(raw.replace(",", "."));
  if (raw === "" || Number.isNaN(pct) || pct < 0 || pct > 100) {
    return { error: "Isi persen komisi 0-100 (boleh desimal, mis. 2,5)." };
  }

  await prisma.user.update({
    where: { id: userId },
    data: { commissionPct: pct },
  });
  revalidatePath("/sales");
  revalidatePath(`/sales/${userId}`);
  return { ok: true };
}

// Admin mencatat no. rekening sales (teks bebas, mis. "BCA 123 a.n. Budi") —
// diedit langsung dari tabel Payroll biar gampang dipakai transfer.
export async function setSalesBankAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const userId = String(formData.get("salesId") ?? "").trim();
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "SALES") {
    return { error: "Akun sales tidak ditemukan." };
  }

  const bankAccount = String(formData.get("bankAccount") ?? "").trim() || null;
  await prisma.user.update({ where: { id: userId }, data: { bankAccount } });
  revalidatePath("/payroll");
  revalidatePath("/sales");
  revalidatePath(`/sales/${userId}`);
  return { ok: true };
}

// Admin mengangkat/mencabut Sales Captain (level 5, rahasia): kepala sales
// untuk satu wilayah — form di halaman detail /sales/[id]. Terbatas: satu
// wilayah hanya boleh punya satu captain. Kirim wilayah kosong = mencabut.
export async function setSalesCaptain(userId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "SALES") {
    return { error: "Akun sales tidak ditemukan." };
  }

  const area = String(formData.get("captainArea") ?? "").trim();
  if (area) {
    const taken = await prisma.user.findFirst({
      where: {
        captainArea: { equals: area, mode: "insensitive" },
        id: { not: userId },
      },
      select: { name: true },
    });
    if (taken) {
      return { error: `Wilayah ${area} sudah dipegang ${taken.name}.` };
    }
  }

  await prisma.user.update({
    where: { id: userId },
    data: { captainArea: area || null },
  });
  revalidatePath("/sales");
  revalidatePath(`/sales/${userId}`);
  revalidatePath("/beranda");
  return { ok: true };
}

// ===== Pencairan fee bagi hasil (komisi) sales =====

// Admin mencatat pencairan fee seorang sales — saldo "belum dicairkan" di
// sisi sales berkurang (reset ke 0 kalau dibayar penuh), dan otomatis jadi
// pengeluaran buku kas "Komisi sales" (terkunci, sourceId = id pencairan).
export async function recordCommissionPayout(
  salesId: string,
  formData: FormData,
) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const target = await prisma.user.findUnique({ where: { id: salesId } });
  if (!target || target.role !== "SALES") {
    return { error: "Akun sales tidak ditemukan." };
  }

  const amount = Math.round(Number(formData.get("amount") ?? 0));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "Jumlah pencairan harus lebih dari 0." };
  }
  const note = String(formData.get("note") ?? "").trim() || null;

  const payout = await prisma.commissionPayout.create({
    data: { salesId, amount, note, createdById: user.id },
  });
  await prisma.financeEntry.create({
    data: {
      type: "EXPENSE",
      amount,
      category: "Komisi sales",
      note: `Pencairan fee ${target.name}${note ? ` - ${note}` : ""}`,
      date: payout.createdAt,
      sourceId: payout.id,
      createdById: user.id,
    },
  });

  after(() => notifyCommissionPayout(salesId, amount, note));
  revalidatePath(`/sales/${salesId}`);
  revalidatePath("/sales");
  revalidatePath("/keuangan");
  revalidatePath("/penghasilan");
  revalidatePath("/beranda");
  revalidatePath("/payroll");
  return { ok: true };
}

// Admin menghapus catatan pencairan (salah input) — entri buku kasnya ikut
// terhapus supaya saldo kas balik benar.
export async function deleteCommissionPayout(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const payout = await prisma.commissionPayout.findUnique({ where: { id } });
  if (!payout) return { error: "Catatan pencairan tidak ditemukan." };

  await prisma.$transaction([
    prisma.financeEntry.deleteMany({ where: { sourceId: id } }),
    prisma.commissionPayout.delete({ where: { id } }),
  ]);
  revalidatePath(`/sales/${payout.salesId}`);
  revalidatePath("/sales");
  revalidatePath("/keuangan");
  revalidatePath("/penghasilan");
  revalidatePath("/beranda");
  revalidatePath("/payroll");
  return { ok: true };
}

// Admin menghapus akun SALES (konter yang dia pegang jadi tanpa sales,
// riwayat kunjungan/transaksi tetap ada)
export async function deleteSalesAccount(userId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "SALES") {
    return { error: "Akun sales tidak ditemukan." };
  }

  await prisma.user.delete({ where: { id: userId } });
  revalidatePath("/data");
  revalidatePath("/dashboard");
  revalidatePath("/sales");
  return { ok: true };
}

// Admin / sales pemegang toko menghapus akun OWNER sebuah konter.
// Konter tetap ada; cuma owner-nya dilepas & akunnya dihapus (tak bisa login).
export async function deleteOwnerAccount(storeId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") return { error: "Tidak punya akses." };

  const store = await prisma.store.findUnique({
    where: { id: storeId },
    select: { ownerUserId: true, salesId: true },
  });
  if (!store || !store.ownerUserId) {
    return { error: "Konter ini belum punya akun owner." };
  }
  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && store.salesId === user.id);
  if (!allowed) return { error: "Konter ini bukan tanggung jawabmu." };

  const ownerId = store.ownerUserId;
  // Lepas dulu dari toko, baru hapus akun (hindari langgar FK).
  await prisma.$transaction([
    prisma.store.update({
      where: { id: storeId },
      data: { ownerUserId: null },
    }),
    prisma.user.delete({ where: { id: ownerId } }),
  ]);
  revalidatePath("/data");
  revalidatePath(`/konter/${storeId}`);
  return { ok: true };
}
