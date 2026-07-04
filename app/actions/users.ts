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
