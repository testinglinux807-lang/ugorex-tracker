import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rupiah } from "@/lib/format";
import { wibMonthStart } from "@/lib/date";
import { syncOrderIncome } from "@/lib/finance-sync";
import { FinanceManager, type FinanceRow } from "@/components/FinanceManager";
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

const PER_PAGE = 20;

export default async function KeuanganPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") redirect("/beranda");

  // Order lunas yang belum tercatat → masuk buku kas sebagai pemasukan
  // otomatis, sebelum angka-angka di bawah dihitung.
  await syncOrderIncome();

  const monthStart = wibMonthStart();

  const total = await prisma.financeEntry.count();
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  // Halaman diminta, dijepit ke rentang valid.
  const reqPage = Number((await searchParams).page ?? 1);
  const page = Math.min(
    totalPages,
    Math.max(1, Number.isFinite(reqPage) ? Math.floor(reqPage) : 1),
  );

  const [entries, allAgg, monthAgg] = await Promise.all([
    prisma.financeEntry.findMany({
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
  ]);

  const sumOf = (
    rows: { type: string; _sum: { amount: number | null } }[],
    type: string,
  ) => rows.find((r) => r.type === type)?._sum.amount ?? 0;

  const income = sumOf(allAgg, "INCOME");
  const expense = sumOf(allAgg, "EXPENSE");
  const balance = income - expense;
  const monthIncome = sumOf(monthAgg, "INCOME");
  const monthExpense = sumOf(monthAgg, "EXPENSE");

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

      {/* Laporan keuangan lengkap di-export ke file (bukan di web) —
          Arus Kas 12 bulan, Laba Rugi, Neraca, dan seluruh buku kas. */}
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

      <FinanceManager entries={rows} page={page} totalPages={totalPages} />
    </div>
  );
}
