"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { FINANCE_TYPES, type FinanceType } from "@/lib/constants";
import { publishRealtime } from "@/lib/realtime";

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
    revalidatePath("/keuangan");
    publishRealtime("keuangan");
    return { ok: true as const, count: 1 };
  }

  // Rentang tanggal (blok, mis. 1-31): nominal yang SAMA dicatat satu entri
  // per hari — buat pengeluaran rutin harian tanpa input satu-satu.
  // Hanya untuk entri baru; saat edit, field "sampai" disembunyikan di form.
  const endRaw = String(formData.get("dateEnd") ?? "").trim();
  let count = 1;
  if (endRaw) {
    const end = new Date(`${endRaw}T00:00:00+07:00`);
    if (isNaN(end.getTime())) return { error: "Tanggal 'sampai' tidak valid." };
    const startDay = new Date(
      `${new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(parsed.data.date)}T00:00:00+07:00`,
    );
    const days =
      Math.round((end.getTime() - startDay.getTime()) / 86_400_000) + 1;
    if (days < 1) {
      return { error: "Tanggal 'sampai' harus sesudah tanggal mulai." };
    }
    if (days > 62) {
      return { error: "Rentang maksimal 62 hari (2 bulan)." };
    }
    count = days;
    await prisma.financeEntry.createMany({
      data: Array.from({ length: days }, (_, i) => ({
        ...parsed.data,
        date: new Date(startDay.getTime() + i * 86_400_000),
        createdById: user.id,
      })),
    });
  } else {
    await prisma.financeEntry.create({
      data: { ...parsed.data, createdById: user.id },
    });
  }
  revalidatePath("/keuangan");
  publishRealtime("keuangan");
  return { ok: true as const, count };
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
  publishRealtime("keuangan");
}
