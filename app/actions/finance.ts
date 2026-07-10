"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FINANCE_TYPES, type FinanceType } from "@/lib/constants";

// Validasi + normalisasi field dari form. Return {error} bila tidak valid,
// atau data siap simpan.
function parseEntry(formData: FormData) {
  const type = String(formData.get("type") ?? "") as FinanceType;
  if (!FINANCE_TYPES.includes(type))
    return { error: "Jenis tidak valid." as const };

  const amount = Math.round(Number(formData.get("amount") ?? 0));
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Jumlah harus lebih dari 0." as const };

  const note = String(formData.get("note") ?? "").trim();
  if (!note) return { error: "Keterangan wajib diisi." as const };

  const category = String(formData.get("category") ?? "").trim() || null;

  // Tanggal opsional (input type=date, WIB). Kosong = sekarang.
  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00+07:00`) : new Date();
  if (isNaN(date.getTime())) return { error: "Tanggal tidak valid." as const };

  return { data: { type, amount, category, note, date } };
}

// Simpan catatan keuangan — buat baru (tanpa id) atau ubah (dengan id).
// Hanya admin.
export async function saveFinanceEntry(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const parsed = parseEntry(formData);
  if ("error" in parsed) return { error: parsed.error };

  const id = String(formData.get("id") ?? "").trim();

  if (id) {
    // Entri otomatis (pemasukan order lunas) mengikuti data ordernya —
    // tidak boleh diubah manual supaya tetap sinkron.
    const existing = await prisma.financeEntry.findUnique({
      where: { id },
      select: { sourceId: true },
    });
    if (existing?.sourceId) {
      return { error: "Entri otomatis dari order tidak bisa diubah." };
    }
    await prisma.financeEntry.update({ where: { id }, data: parsed.data });
  } else {
    await prisma.financeEntry.create({
      data: { ...parsed.data, createdById: user.id },
    });
  }
  revalidatePath("/keuangan");
  return { ok: true };
}

// Hapus catatan keuangan — hanya admin.
export async function deleteFinanceEntry(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return;

  // Entri otomatis tidak bisa dihapus — kalaupun dihapus, rekonsiliasi
  // syncOrderIncome akan membuatnya lagi selama ordernya tetap lunas.
  const existing = await prisma.financeEntry.findUnique({
    where: { id },
    select: { sourceId: true },
  });
  if (existing?.sourceId) return;

  await prisma.financeEntry.delete({ where: { id } });
  revalidatePath("/keuangan");
}
