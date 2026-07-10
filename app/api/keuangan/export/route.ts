import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { syncOrderIncome } from "@/lib/finance-sync";
import { wibMonthStart, fmtDate } from "@/lib/date";
import {
  monthlyCashflow,
  periodPnl,
  wibMonthLabel,
} from "@/lib/finance-report";

// Export laporan keuangan sebagai CSV yang ramah Excel: Arus Kas 12 bulan,
// Laba Rugi (bulan ini & bulan lalu), Neraca, dan seluruh buku kas — satu
// file, dipisah judul bagian. Delimiter ; + BOM UTF-8 + baris "sep=;"
// supaya Excel locale Indonesia langsung membelah kolom dengan benar.

const esc = (v: string | number): string => {
  const s = String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const row = (...cells: (string | number)[]) => cells.map(esc).join(";");

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new Response("Hanya admin.", { status: 403 });
  }

  // Pastikan pemasukan order lunas sudah tercatat sebelum laporan disusun
  await syncOrderIncome();

  const [allEntries, piutangAgg, products] = await Promise.all([
    prisma.financeEntry.findMany({
      select: {
        type: true,
        amount: true,
        date: true,
        category: true,
        note: true,
      },
      orderBy: { date: "asc" },
    }),
    prisma.request.aggregate({
      where: {
        items: { some: {} },
        paymentStatus: { not: "PAID" },
        status: { in: ["SHIPPED", "COMPLETED"] },
      },
      _sum: { total: true },
    }),
    prisma.product.findMany({ select: { price: true, centralStock: true } }),
  ]);

  const monthStart = wibMonthStart();
  const prevMonthStart = wibMonthStart(new Date(monthStart.getTime() - 1));
  const cashflow = monthlyCashflow(allEntries, 12);
  const pnls = [
    periodPnl(allEntries, monthStart, null, wibMonthLabel(monthStart)),
    periodPnl(
      allEntries,
      prevMonthStart,
      monthStart,
      wibMonthLabel(prevMonthStart),
    ),
  ];

  const kas = allEntries.reduce(
    (a, e) => a + (e.type === "INCOME" ? e.amount : -e.amount),
    0,
  );
  const piutang = piutangAgg._sum.total ?? 0;
  const persediaan = products.reduce(
    (a, p) => a + p.price * p.centralStock,
    0,
  );

  const today = fmtDate(new Date(), {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const lines: string[] = [
    "sep=;",
    row("LAPORAN KEUANGAN UGOREX"),
    row("Dibuat", `${today} WIB`),
    "",
    row("ARUS KAS (12 BULAN TERAKHIR)"),
    row("Bulan", "Kas Masuk", "Kas Keluar", "Arus Bersih", "Saldo Akhir"),
    ...cashflow.map((r) => row(r.label, r.masuk, r.keluar, r.net, r.saldo)),
    "",
  ];

  for (const p of pnls) {
    lines.push(row(`LABA RUGI — ${p.label}`), row("Pendapatan", "Jumlah"));
    if (p.income.length === 0) lines.push(row("(belum ada)", 0));
    for (const r of p.income) lines.push(row(r.category, r.amount));
    lines.push(row("Total Pendapatan", p.totalIncome), row("Beban", "Jumlah"));
    if (p.expense.length === 0) lines.push(row("(belum ada)", 0));
    for (const r of p.expense) lines.push(row(r.category, r.amount));
    lines.push(
      row("Total Beban", p.totalExpense),
      row(p.net < 0 ? "Rugi Bersih" : "Laba Bersih", p.net),
      "",
    );
  }

  lines.push(
    row(`NERACA per ${today}`),
    row("Aset", "Jumlah"),
    row("Kas (saldo buku kas)", kas),
    row("Piutang usaha (order belum dibayar)", piutang),
    row("Persediaan (estimasi harga jual)", persediaan),
    row("Total Aset", kas + piutang + persediaan),
    row("Kewajiban (utang)", "belum dicatat"),
    row("Modal (ekuitas)", kas + piutang + persediaan),
    "",
    row("BUKU KAS (SEMUA ENTRI)"),
    row("Tanggal", "Jenis", "Kategori", "Keterangan", "Masuk", "Keluar"),
    ...allEntries.map((e) =>
      row(
        fmtDate(e.date, { day: "2-digit", month: "2-digit", year: "numeric" }),
        e.type === "INCOME" ? "Pemasukan" : "Pengeluaran",
        e.category ?? "",
        e.note,
        e.type === "INCOME" ? e.amount : "",
        e.type === "EXPENSE" ? e.amount : "",
      ),
    ),
  );

  // BOM supaya Excel membaca UTF-8 dengan benar
  const csv = "﻿" + lines.join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="laporan-keuangan-${stamp}.csv"`,
    },
  });
}
