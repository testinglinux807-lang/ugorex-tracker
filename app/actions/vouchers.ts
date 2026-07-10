"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { findUsableVoucher } from "@/lib/voucher";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user.role === "ADMIN" ? user : null;
}

// Admin membuat kode voucher baru (menu Data)
export async function createVoucher(formData: FormData) {
  if (!(await requireAdmin())) {
    return { error: "Hanya admin yang bisa membuat voucher." };
  }

  const code = String(formData.get("code") ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  const type = String(formData.get("type") ?? "PERCENT");
  const value = parseInt(String(formData.get("value") ?? "0"), 10) || 0;
  const maxUsesRaw = String(formData.get("maxUses") ?? "").trim();
  const maxUses = maxUsesRaw ? parseInt(maxUsesRaw, 10) || 0 : null;
  const expiresRaw = String(formData.get("expiresAt") ?? "").trim();

  if (!/^[A-Z0-9-]{3,20}$/.test(code)) {
    return { error: "Kode 3-20 karakter, huruf/angka/strip tanpa spasi." };
  }
  if (!["PERCENT", "FIXED"].includes(type)) return { error: "Jenis tidak valid." };
  if (type === "PERCENT" && (value < 1 || value > 100)) {
    return { error: "Persen diskon harus 1-100." };
  }
  if (type === "FIXED" && value < 1) {
    return { error: "Potongan Rupiah harus lebih dari 0." };
  }
  if (maxUses != null && maxUses < 1) {
    return { error: "Batas pemakaian minimal 1 (atau kosongkan)." };
  }
  // Kadaluarsa dihitung sampai akhir hari yang dipilih
  let expiresAt: Date | null = null;
  if (expiresRaw) {
    expiresAt = new Date(`${expiresRaw}T23:59:59`);
    if (Number.isNaN(expiresAt.getTime())) {
      return { error: "Tanggal kadaluarsa tidak valid." };
    }
  }

  const dup = await prisma.voucher.findUnique({ where: { code } });
  if (dup) return { error: `Kode ${code} sudah dipakai voucher lain.` };

  await prisma.voucher.create({
    data: { code, type, value, maxUses, expiresAt },
  });
  revalidatePath("/data");
  return { ok: true };
}

// Admin mengaktifkan / menonaktifkan voucher
export async function toggleVoucher(id: string) {
  if (!(await requireAdmin())) return;
  const v = await prisma.voucher.findUnique({ where: { id } });
  if (!v) return;
  await prisma.voucher.update({
    where: { id },
    data: { active: !v.active },
  });
  revalidatePath("/data");
}

// Admin menghapus voucher
export async function deleteVoucher(id: string) {
  if (!(await requireAdmin())) return;
  await prisma.voucher.delete({ where: { id } }).catch(() => {});
  revalidatePath("/data");
}

// Admin membuat tier diskon grosir (menu Data, di bawah Voucher Toko):
// order restok dengan total qty >= minQty otomatis dapat diskon percent%.
export async function createGrosirTier(formData: FormData) {
  if (!(await requireAdmin())) {
    return { error: "Hanya admin yang bisa mengatur diskon grosir." };
  }

  const minQty = parseInt(String(formData.get("minQty") ?? "0"), 10) || 0;
  const percent = parseInt(String(formData.get("percent") ?? "0"), 10) || 0;
  if (minQty < 2) return { error: "Minimal pembelian paling sedikit 2 pcs." };
  if (percent < 1 || percent > 100) {
    return { error: "Persen diskon harus 1-100." };
  }

  const dup = await prisma.grosirTier.findFirst({ where: { minQty } });
  if (dup) {
    return { error: `Tier untuk minimal ${minQty} pcs sudah ada.` };
  }

  await prisma.grosirTier.create({ data: { minQty, percent } });
  revalidatePath("/data");
  revalidatePath("/order");
  return { ok: true };
}

// Admin mengaktifkan / menonaktifkan tier grosir
export async function toggleGrosirTier(id: string) {
  if (!(await requireAdmin())) return;
  const t = await prisma.grosirTier.findUnique({ where: { id } });
  if (!t) return;
  await prisma.grosirTier.update({
    where: { id },
    data: { active: !t.active },
  });
  revalidatePath("/data");
  revalidatePath("/order");
}

// Admin menghapus tier grosir
export async function deleteGrosirTier(id: string) {
  if (!(await requireAdmin())) return;
  await prisma.grosirTier.delete({ where: { id } }).catch(() => {});
  revalidatePath("/data");
  revalidatePath("/order");
}

// Owner mengecek kode voucher dari form checkout/POS (preview diskon).
// Validasi FINAL tetap terjadi di server saat transaksi dibuat.
export async function checkVoucher(code: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const found = await findUsableVoucher(code);
  if ("error" in found) return { error: found.error };
  const v = found.voucher!;
  return {
    ok: true as const,
    code: v.code,
    type: v.type,
    value: v.value,
  };
}
