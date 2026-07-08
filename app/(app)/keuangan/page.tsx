import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rupiah } from "@/lib/format";
import { wibMonthStart } from "@/lib/date";
import { FinanceManager, type FinanceRow } from "@/components/FinanceManager";
import { ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";

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
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Keuangan</h1>
        <p className="text-sm text-neutral-500">
          Buku kas — catat pemasukan (profit orderan) & pengeluaran (beli
          barang, ongkir, gaji)
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

      <FinanceManager entries={rows} page={page} totalPages={totalPages} />
    </div>
  );
}
