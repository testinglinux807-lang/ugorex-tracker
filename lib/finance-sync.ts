import "server-only";
import { prisma } from "./prisma";
import { wibMonthStart } from "./date";
import { getPayrollConfig } from "./payroll-config";
import { computeGudangPayroll, sessionHours } from "./payroll";
import { wibPeriod, periodLabel } from "./sales-score-history";

// Satukan keuangan dengan penjualan order: setiap order restock yang sudah
// LUNAS otomatis tercatat sebagai pemasukan di buku kas (kategori
// "Penjualan Order", tanggal = tanggal order, sourceId = id order).
//
// Dipanggil saat halaman /keuangan atau export dibuka — rekonsiliasi ini
// menangkap order yang lunas lewat jalur mana pun (webhook Midtrans,
// polling, tandai cash) tanpa perlu menyisipkan pencatatan di tiap jalur
// pembayaran. Idempoten: sourceId @unique + skipDuplicates menjamin satu
// order hanya tercatat sekali, dipanggil berbarengan pun aman.
export async function syncOrderIncome(): Promise<void> {
  const paid = await prisma.request.findMany({
    where: {
      items: { some: {} },
      paymentStatus: "PAID",
      total: { gt: 0 },
    },
    select: {
      id: true,
      total: true,
      createdAt: true,
      store: { select: { name: true } },
    },
  });
  if (paid.length === 0) return;

  const existing = new Set(
    (
      await prisma.financeEntry.findMany({
        where: { sourceId: { in: paid.map((r) => r.id) } },
        select: { sourceId: true },
      })
    ).map((e) => e.sourceId),
  );
  const missing = paid.filter((r) => !existing.has(r.id));
  if (missing.length === 0) return;

  await prisma.financeEntry.createMany({
    data: missing.map((r) => ({
      type: "INCOME",
      amount: r.total,
      category: "Penjualan Order",
      note: `Order #${r.id.slice(-8).toUpperCase()} — ${r.store.name}`,
      date: r.createdAt,
      sourceId: r.id,
    })),
    skipDuplicates: true,
  });
}

// Satukan buku kas dengan gaji GUDANG bulan berjalan: tiap karyawan gudang
// dicatat sebagai pengeluaran "Gaji Gudang" (gaji pokok + lembur − potongan),
// idempoten per (karyawan, bulan) lewat sourceId. Dipanggil saat /keuangan
// atau /payroll dibuka — jadi angkanya selalu ikut lembur/potongan terbaru
// TANPA tombol manual. Komisi sales TIDAK di sini (lewat payout sendiri).
//
// Dedup: hanya menulis kalau nominalnya berubah (hemat egress).
export async function syncGudangSalary(): Promise<void> {
  const monthStart = wibMonthStart();
  const nextMonth = new Date(
    new Date(monthStart).setMonth(monthStart.getMonth() + 1),
  );
  const period = wibPeriod(monthStart);

  const employees = await prisma.user.findMany({
    where: { role: "GUDANG" },
    select: {
      id: true,
      name: true,
      basePay: true,
      payrollLogs: {
        where: { date: { gte: monthStart, lt: nextMonth } },
        select: { type: true, amount: true },
      },
      lemburSessions: {
        where: {
          startAt: { gte: monthStart, lt: nextMonth },
          endAt: { not: null },
        },
        select: { startAt: true, endAt: true },
      },
    },
  });
  if (employees.length === 0) return;

  const cfg = await getPayrollConfig();
  for (const e of employees) {
    const lemburJam = e.lemburSessions.reduce(
      (s, ss) => s + sessionHours(ss.startAt, ss.endAt),
      0,
    );
    const row = computeGudangPayroll(
      { userId: e.id, name: e.name, basePay: e.basePay },
      lemburJam,
      e.payrollLogs,
      cfg,
    );
    const amount = Math.max(0, row.total);
    const sourceId = `payroll_gudang_${e.id}_${period}`;

    const existing = await prisma.financeEntry.findUnique({
      where: { sourceId },
      select: { amount: true },
    });
    if (existing?.amount === amount) continue;

    await prisma.financeEntry.upsert({
      where: { sourceId },
      update: { amount, date: monthStart },
      create: {
        type: "EXPENSE",
        amount,
        category: "Gaji Gudang",
        note: `Gaji ${e.name} — ${periodLabel(period)}`,
        date: monthStart,
        sourceId,
      },
    });
  }
}
