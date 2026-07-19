import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rupiah } from "@/lib/format";
import { wibMonthStart } from "@/lib/date";
import { syncOrderIncome } from "@/lib/finance-sync";
import { financeStatements, classifyExpense } from "@/lib/finance-statements";
import { FinanceManager, type FinanceRow } from "@/components/FinanceManager";
import { FinanceStatements } from "@/components/FinanceStatements";
import {
  ArrowDownLeft,
  ArrowUpRight,
  FileSpreadsheet,
  Wallet,
} from "lucide-react";

function SummaryCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  className = "",
}: {
  label: string;
  value: number;
  hint?: string;
  tone: "income" | "expense" | "balance";
  icon: typeof Wallet;
  className?: string;
}) {
  const valueCls =
    tone === "income"
      ? "text-brand-dark"
      : tone === "expense"
        ? "text-neutral-900"
        : value < 0
          ? "text-red-600"
          : "text-neutral-900";
  return (
    <div
      className={`rounded-xl border border-neutral-200 bg-white p-3 sm:p-4 ${className}`}
    >
      <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-neutral-500">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        {label}
      </div>
      <p className={`truncate text-lg font-bold sm:text-xl ${valueCls}`}>
        {rupiah(value)}
      </p>
      {hint && <p className="mt-0.5 truncate text-xs text-neutral-400">{hint}</p>}
    </div>
  );
}

const PER_PAGE = 4;

export default async function KeuanganPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; tahun?: string; jenis?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/beranda");

  // Order lunas yang belum tercatat → masuk buku kas sebagai pemasukan
  // otomatis, sebelum angka-angka di bawah dihitung.
  await syncOrderIncome();

  const monthStart = wibMonthStart();

  const params = await searchParams;
  // Filter jenis riwayat (?jenis=masuk|keluar) — ikut pagination
  const jenis =
    params.jenis === "masuk"
      ? ("INCOME" as const)
      : params.jenis === "keluar"
        ? ("EXPENSE" as const)
        : null;
  const entryWhere = jenis ? { type: jenis } : {};

  const total = await prisma.financeEntry.count({ where: entryWhere });
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  // Halaman diminta, dijepit ke rentang valid.
  const reqPage = Number(params.page ?? 1);
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(reqPage) ? Math.floor(reqPage) : 1),
  );

  const [entries, allAgg, monthAgg, allEntries, piutangAgg, products] =
    await Promise.all([
    prisma.financeEntry.findMany({
      where: entryWhere,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      include: { createdBy: { select: { name: true } } },
    }),
    prisma.financeEntry.groupBy({ by: ["type"], _sum: { amount: true } }),
    prisma.financeEntry.groupBy({
      by: ["type"],
      _sum: { amount: true },
      where: { date: { gte: monthStart } },
    }),
    // Bahan laporan Laba Rugi / Neraca / Arus Kas 12 bulan
    prisma.financeEntry.findMany({
      select: { type: true, amount: true, date: true, category: true },
      orderBy: { date: "asc" },
    }),
    // Piutang: order terkirim/selesai yang belum dibayar (sama dgn export)
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

  // ===== Rincian duit omzet (otomatis): omzet order − HPP − komisi sales =====
  const paidOrderWhere = {
    items: { some: {} },
    paymentStatus: "PAID",
    status: { not: "CANCELLED" },
  } as const;
  const [omzetAllAgg, omzetMonthAgg, commissionSales, allStores, restokAll, restokMonth] =
    await Promise.all([
      prisma.request.aggregate({ where: paidOrderWhere, _sum: { total: true } }),
      prisma.request.aggregate({
        where: { ...paidOrderWhere, createdAt: { gte: monthStart } },
        _sum: { total: true },
      }),
      // Sales ber-komisi affiliator (persen di-set admin di detail sales)
      prisma.user.findMany({
        where: { role: "SALES", commissionPct: { gt: 0 } },
        select: { id: true, commissionPct: true },
      }),
      prisma.store.findMany({ select: { id: true, salesId: true } }),
      // Omzet RESTOK (order lunas) per konter — dasar komisi (rumus sama
      // dgn halaman /sales: yang dihitung toko belanja barang kita)
      prisma.request.groupBy({
        by: ["storeId"],
        where: paidOrderWhere,
        _sum: { total: true },
      }),
      prisma.request.groupBy({
        by: ["storeId"],
        where: { ...paidOrderWhere, createdAt: { gte: monthStart } },
        _sum: { total: true },
      }),
    ]);

  // Komisi = Σ (persen sales × omzet restok konter yang dia pegang)
  const commissionTotal = (
    rows: { storeId: string; _sum: { total: number | null } }[],
  ) => {
    const restokByStore = new Map(
      rows.map((r) => [r.storeId, r._sum.total ?? 0]),
    );
    const restokBySales = new Map<string, number>();
    for (const s of allStores) {
      if (!s.salesId) continue;
      restokBySales.set(
        s.salesId,
        (restokBySales.get(s.salesId) ?? 0) + (restokByStore.get(s.id) ?? 0),
      );
    }
    return commissionSales.reduce(
      (sum, u) =>
        sum +
        Math.round(((restokBySales.get(u.id) ?? 0) * u.commissionPct) / 100),
      0,
    );
  };
  // HPP/COGS dari buku kas — pemetaan kategori sama dengan laporan Laba Rugi
  const hppTotal = (from?: Date) =>
    allEntries.reduce(
      (sum, e) =>
        e.type === "EXPENSE" &&
        classifyExpense(e.category) === "hpp" &&
        (!from || e.date >= from)
          ? sum + e.amount
          : sum,
      0,
    );

  const omzetRincian = (["month", "all"] as const).map((k) => {
    const omzet =
      (k === "month" ? omzetMonthAgg : omzetAllAgg)._sum.total ?? 0;
    const hpp = hppTotal(k === "month" ? monthStart : undefined);
    const komisi = commissionTotal(k === "month" ? restokMonth : restokAll);
    return { omzet, hpp, komisi, laba: omzet - hpp - komisi };
  });

  const sumOf = (
    rows: { type: string; _sum: { amount: number | null } }[],
    type: string,
  ) => rows.find((r) => r.type === type)?._sum.amount ?? 0;

  const income = sumOf(allAgg, "INCOME");
  const expense = sumOf(allAgg, "EXPENSE");
  const balance = income - expense;
  const monthIncome = sumOf(monthAgg, "INCOME");
  const monthExpense = sumOf(monthAgg, "EXPENSE");

  // Laporan tahunan (?tahun=YYYY, default tahun berjalan WIB)
  const maxYear = Number(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
    }).format(new Date()),
  );
  const minYear = allEntries.length
    ? Number(
        new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
          year: "numeric",
        }).format(allEntries[0].date),
      )
    : maxYear;
  const reqYear = Number(params.tahun ?? maxYear);
  const year = Math.min(
    maxYear,
    Math.max(minYear, Number.isFinite(reqYear) ? Math.floor(reqYear) : maxYear),
  );
  const statements = financeStatements(allEntries, {
    year,
    piutang: piutangAgg._sum.total ?? 0,
    persediaan: products.reduce((a, p) => a + p.price * p.centralStock, 0),
  });

  const rows: FinanceRow[] = entries.map((e) => ({
    id: e.id,
    type: e.type as FinanceRow["type"],
    amount: e.amount,
    category: e.category,
    note: e.note,
    date: e.date.toISOString(),
    createdByName: e.createdBy?.name ?? null,
    auto: e.sourceId !== null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Keuangan</h1>
        <p className="text-sm text-neutral-500">
          Buku kas — pemasukan dari order lunas tercatat otomatis; catat
          manual pengeluaran (beli barang, ongkir, gaji) & pemasukan lain
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <SummaryCard
          label="Pemasukan"
          value={income}
          hint={`Bulan ini ${rupiah(monthIncome)}`}
          tone="income"
          icon={ArrowDownLeft}
        />
        <SummaryCard
          label="Pengeluaran"
          value={expense}
          hint={`Bulan ini ${rupiah(monthExpense)}`}
          tone="expense"
          icon={ArrowUpRight}
        />
        {/* Saldo/Laba melebar penuh di mobile — angka paling penting */}
        <SummaryCard
          label="Saldo / Laba"
          value={balance}
          hint={balance < 0 ? "Minus" : "Pemasukan − pengeluaran"}
          tone="balance"
          icon={Wallet}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      {/* Rincian duit omzet — dihitung otomatis, bukan entri buku kas:
          omzet order lunas − HPP (buku kas) − komisi sales (persen × POS) */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Duit Omzet (otomatis)</h2>
        <p className="mb-3 mt-0.5 text-xs text-neutral-400">
          Omzet order lunas dipotong HPP &amp; komisi sales — dihitung
          langsung, bukan catatan buku kas.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs text-neutral-400">
                <th className="py-1.5 text-left font-medium"> </th>
                <th className="py-1.5 text-right font-medium">Bulan ini</th>
                <th className="py-1.5 text-right font-medium">Semua waktu</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {(
                [
                  ["Omzet (order restok lunas)", "omzet", ""],
                  ["HPP / COGS (beli barang, ongkir)", "hpp", "−"],
                  ["Komisi sales (affiliator)", "komisi", "−"],
                ] as const
              ).map(([label, key, sign]) => (
                <tr key={key} className="border-b border-neutral-100">
                  <td className="py-2 text-neutral-600">{label}</td>
                  {omzetRincian.map((r, i) => (
                    <td key={i} className="py-2 text-right">
                      {sign}
                      {rupiah(r[key])}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-bold">
                <td className="py-2">Laba setelah HPP &amp; komisi</td>
                {omzetRincian.map((r, i) => (
                  <td
                    key={i}
                    className={`py-2 text-right ${
                      r.laba < 0 ? "text-red-600" : "text-brand-dark"
                    }`}
                  >
                    {rupiah(r.laba)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-neutral-400">
          Komisi = persen affiliator × omzet restok (order lunas) konter tiap
          sales (rumus sama dengan halaman Performa Sales). Saat komisinya
          benar-benar
          dibayarkan, catat sebagai pengeluaran kategori &ldquo;Komisi
          sales&rdquo; supaya masuk buku kas.
        </p>
      </div>

      {/* Laporan tahunan 12 bulan — Laba Rugi, Neraca, Arus Kas
          (lib/finance-statements.ts, kerangka Financial Statement Template) */}
      <FinanceStatements data={statements} minYear={minYear} maxYear={maxYear} />

      {/* Versi file dari laporan di atas + seluruh buku kas. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold">
            <FileSpreadsheet className="h-4 w-4 text-neutral-500" />
            Laporan Keuangan (Excel/CSV)
          </p>
          <p className="mt-0.5 text-xs text-neutral-400">
            Arus kas 12 bulan · laba rugi bulan ini &amp; lalu · neraca ·
            seluruh buku kas — langsung terbuka rapi di Excel/Sheets.
          </p>
        </div>
        <a
          href="/api/keuangan/export"
          download
          className="shrink-0 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          Download Laporan
        </a>
      </div>

      <FinanceManager
        entries={rows}
        filter={jenis ?? "ALL"}
        page={page}
        totalPages={totalPages}
      />
    </div>
  );
}
