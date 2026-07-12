"use server";

import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

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

// Admin membuat akun SALES
export async function createSalesAccount(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const name = String(formData.get("name") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!name || !phone || !password) {
    return { error: "Semua field wajib diisi." };
  }

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing) return { error: "Nomor HP sudah terdaftar." };

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.create({
    data: { name, phone, passwordHash, role: "SALES", createdById: user.id },
  });
  revalidatePath("/data");
  return { ok: true };
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

  await prisma.user.update({
    where: { id: userId },
    data: {
      name,
      phone,
      ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}),
    },
  });
  revalidatePath("/data");
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
