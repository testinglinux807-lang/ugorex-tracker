import { redirect } from "next/navigation";
import Link from "next/link";
import { Coins, ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { periodMonthStart } from "@/lib/date";
import { computeLevel } from "@/lib/sales-kpi-grade";
import {
  computeSalesKpiValues,
  activeDaysBySalesFrom,
} from "@/lib/sales-kpi-values";
import { getScoreTargets } from "@/lib/kpi-config";
import {
  getPriorScoresBatch,
  wibPeriod,
  periodLabel,
  periodShift,
} from "@/lib/sales-score-history";
import { getPayrollConfig } from "@/lib/payroll-config";
import { getGudangRadiusKm } from "@/lib/gudang-assign";
import { syncGudangSalary } from "@/lib/finance-sync";
import {
  computeSalesPayroll,
  computeGudangPayroll,
  sessionHours,
} from "@/lib/payroll";
import { PayrollTabs } from "@/components/PayrollTabs";

export default async function PayrollPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");
  if (user.role === "GUDANG") redirect("/gudang");

  // Gaji gudang bulan BERJALAN → buku kas otomatis (idempoten, dedup) —
  // selalu bulan ini, terlepas dari periode yang sedang dilihat admin.
  await syncGudangSalary();

  const currentPeriod = wibPeriod();
  const params = await searchParams;
  const period =
    params.period && /^\d{4}-\d{2}$/.test(params.period) && params.period <= currentPeriod
      ? params.period
      : currentPeriod;
  const isCurrentPeriod = period === currentPeriod;
  const monthStart = periodMonthStart(period);
  const nextMonth = new Date(
    new Date(monthStart).setMonth(monthStart.getMonth() + 1),
  );
  const monthLabel = periodLabel(period);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  const [
    salesUsers,
    stores,
    prospects,
    paidOrders,
    feeOrders,
    payoutSums,
    stageLogs,
    gudangUsers,
    cfg,
    scoreTargets,
  ] = await Promise.all([
      prisma.user.findMany({
        where: { role: "SALES" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          commissionPct: true,
          captainArea: true,
          bankAccount: true,
        },
      }),
      prisma.store.findMany({
        select: { id: true, salesId: true, createdAt: true },
      }),
      prisma.prospect.findMany({ select: { storeId: true, stage: true } }),
      prisma.request.findMany({
        where: {
          items: { some: {} },
          paymentStatus: "PAID",
          status: { not: "CANCELLED" },
          createdAt: { gte: monthStart, lt: nextMonth },
        },
        select: { storeId: true, total: true },
      }),
      // Semua order lunas (semua waktu) — dasar fee kumulatif, sama dgn
      // /sales/[id] & /penghasilan. Dipetakan storeId→salesId di bawah.
      prisma.request.findMany({
        where: {
          items: { some: {} },
          paymentStatus: "PAID",
          status: { not: "CANCELLED" },
        },
        select: { storeId: true, total: true },
      }),
      // Total fee yang sudah dicairkan admin, per sales (CommissionPayout)
      prisma.commissionPayout.groupBy({
        by: ["salesId"],
        _sum: { amount: true },
      }),
      prisma.stageLog.findMany({
        where: { createdAt: { gte: monthStart, lt: nextMonth } },
        select: { salesId: true, createdAt: true },
      }),
      prisma.user.findMany({
        where: { role: "GUDANG" },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          phone: true,
          basePay: true,
          bankAccount: true,
          homeLat: true,
          homeLng: true,
          payrollLogs: {
            where: { date: { gte: monthStart, lt: nextMonth } },
            orderBy: { date: "desc" },
            select: { id: true, date: true, type: true, amount: true, note: true },
          },
          lemburSessions: {
            where: { startAt: { gte: monthStart, lt: nextMonth } },
            orderBy: { startAt: "desc" },
            select: { id: true, startAt: true, endAt: true },
          },
        },
      }),
      getPayrollConfig(),
      getScoreTargets(),
    ]);

  const priorScores = await getPriorScoresBatch(
    salesUsers.map((u) => u.id),
    period,
  );
  const activeMap = activeDaysBySalesFrom(stageLogs);
  const gudangRadius = await getGudangRadiusKm();

  // Status gaji gudang yang sudah ditandai dicairkan periode ini
  const gudangSalaryPaidRows = await prisma.gudangSalaryPayout.findMany({
    where: { period },
    select: { userId: true },
  });
  const gudangSalaryPaidSet = new Set(gudangSalaryPaidRows.map((r) => r.userId));

  // Yang BENERAN sudah tercatat di buku kas bulan ini (bukan proyeksi) —
  // tiap kategori diisi otomatis: fee via recordCommissionPayout, bonus via
  // markKpiBonusPaid, gaji gudang via syncGudangSalary (lib/finance-sync.ts).
  const recordedRows = await prisma.financeEntry.groupBy({
    by: ["category"],
    where: {
      category: { in: ["Komisi sales", "Bonus KPI Sales", "Gaji Gudang"] },
      date: { gte: monthStart, lt: nextMonth },
    },
    _sum: { amount: true },
  });
  const recordedByCategory = new Map(
    recordedRows.map((r) => [r.category, r._sum.amount ?? 0]),
  );
  const recorded = {
    fee: recordedByCategory.get("Komisi sales") ?? 0,
    bonus: recordedByCategory.get("Bonus KPI Sales") ?? 0,
    gudangSalary: recordedByCategory.get("Gaji Gudang") ?? 0,
  };

  // Peta storeId → salesId (buat membebankan fee order ke sales-nya)
  const storeToSales = new Map<string, string>();
  for (const s of stores) if (s.salesId) storeToSales.set(s.id, s.salesId);
  const pctBySales = new Map<string, number>();
  for (const u of salesUsers) pctBySales.set(u.id, u.commissionPct);
  // Fee kumulatif (semua waktu) per sales = Σ round(total × %komisi) DIBULATKAN
  // PER ORDER — sama persis dgn "Belum dicairkan" di /sales/[id].
  const feeAllTimeBySales = new Map<string, number>();
  for (const o of feeOrders) {
    const sid = storeToSales.get(o.storeId);
    if (!sid) continue;
    const fee = Math.round((o.total * (pctBySales.get(sid) ?? 0)) / 100);
    feeAllTimeBySales.set(sid, (feeAllTimeBySales.get(sid) ?? 0) + fee);
  }
  const paidOutBySales = new Map<string, number>();
  for (const p of payoutSums)
    paidOutBySales.set(p.salesId, p._sum.amount ?? 0);

  // Bonus KPI yang sudah ditandai lunas bulan ini
  const bonusPaidRows = await prisma.kpiBonusPayout.findMany({
    where: { period },
    select: { salesId: true },
  });
  const bonusPaidSet = new Set(bonusPaidRows.map((r) => r.salesId));

  // ===== Payroll sales — level & skor dari pipeline grade yang sama =====
  const sales = salesUsers
    .map((u) => {
      const myStores = stores.filter((s) => s.salesId === u.id);
      const kpiValues = computeSalesKpiValues({
        stores: myStores,
        ordersMonth: paidOrders,
        prospects,
        activeDays: activeMap.get(u.id) ?? 0,
        monthStart,
      });
      const result = computeLevel(
        kpiValues,
        scoreTargets,
        u.captainArea,
        priorScores.get(u.id) ?? [],
      );
      const feeAllTime = feeAllTimeBySales.get(u.id) ?? 0;
      const feePaid = paidOutBySales.get(u.id) ?? 0;
      return computeSalesPayroll(
        {
          salesId: u.id,
          name: u.name,
          level: result.level,
          levelName: result.levelName,
          omzet: kpiValues.omzet,
          pct: u.commissionPct,
          score: result.avgScore,
          feeOutstanding: feeAllTime - feePaid,
          feePaid,
          bonusPaid: bonusPaidSet.has(u.id),
          bankAccount: u.bankAccount,
        },
        cfg,
      );
    })
    .sort((a, b) => b.total - a.total);

  // ===== Payroll gudang (user role GUDANG) — lembur dari sesi clock =====
  const gudang = gudangUsers.map((e) => {
    const lemburJam = e.lemburSessions.reduce(
      (s, ss) => s + sessionHours(ss.startAt, ss.endAt),
      0,
    );
    return computeGudangPayroll(
      {
        userId: e.id,
        name: e.name,
        basePay: e.basePay,
        salaryPaid: gudangSalaryPaidSet.has(e.id),
        bankAccount: e.bankAccount,
      },
      lemburJam,
      e.payrollLogs,
      cfg,
    );
  });
  const employeeList = gudangUsers.map((e) => ({
    id: e.id,
    name: e.name,
    phone: e.phone,
    basePay: e.basePay,
    bankAccount: e.bankAccount,
    homeLat: e.homeLat,
    homeLng: e.homeLng,
  }));
  const logs = gudangUsers
    .flatMap((e) =>
      e.payrollLogs.map((l) => ({
        id: l.id,
        date: l.date.toISOString(),
        userName: e.name,
        type: l.type,
        amount: l.amount,
        note: l.note,
      })),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const lembur = gudangUsers
    .flatMap((e) =>
      e.lemburSessions.map((s) => ({
        id: s.id,
        userName: e.name,
        startAt: s.startAt.toISOString(),
        endAt: s.endAt ? s.endAt.toISOString() : null,
        hours: sessionHours(s.startAt, s.endAt),
      })),
    )
    .sort((a, b) => b.startAt.localeCompare(a.startAt));

  const prevPeriod = periodShift(period, -1);
  const nextPeriod = periodShift(period, 1);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Coins className="h-6 w-6" />
            Payroll
          </h1>
          <p className="text-sm text-neutral-500">
            Gaji sales & gudang · sales otomatis dari Tracker
          </p>
        </div>
        <div className="shrink-0">
          <MonthNav
            monthLabel={monthLabel}
            prevPeriod={prevPeriod}
            nextPeriod={nextPeriod}
            isCurrentPeriod={isCurrentPeriod}
          />
        </div>
      </div>

      <PayrollTabs
        monthLabel={monthLabel}
        period={period}
        isCurrentPeriod={isCurrentPeriod}
        today={today}
        sales={sales}
        gudang={gudang}
        employees={employeeList}
        logs={logs}
        lembur={lembur}
        cfg={cfg}
        radiusKm={gudangRadius}
        recorded={recorded}
      />
    </div>
  );
}

// Navigasi bulan payroll (?period=YYYY-MM) — tidak boleh maju melewati
// bulan berjalan (data masa depan belum ada).
function MonthNav({
  monthLabel,
  prevPeriod,
  nextPeriod,
  isCurrentPeriod,
}: {
  monthLabel: string;
  prevPeriod: string;
  nextPeriod: string;
  isCurrentPeriod: boolean;
}) {
  return (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 bg-white p-1">
      <Link
        href={`/payroll?period=${prevPeriod}`}
        className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
        title="Bulan sebelumnya"
      >
        <ChevronLeft className="h-4 w-4" />
      </Link>
      <span className="min-w-[92px] text-center text-sm font-semibold tabular-nums">
        {monthLabel}
      </span>
      {isCurrentPeriod ? (
        <span className="grid h-8 w-8 place-items-center text-neutral-200">
          <ChevronRight className="h-4 w-4" />
        </span>
      ) : (
        <Link
          href={`/payroll?period=${nextPeriod}`}
          className="grid h-8 w-8 place-items-center rounded-md text-neutral-500 hover:bg-neutral-100"
          title="Bulan berikutnya"
        >
          <ChevronRight className="h-4 w-4" />
        </Link>
      )}
      {!isCurrentPeriod && (
        <Link
          href="/payroll"
          className="ml-1 rounded-md px-2 py-1.5 text-xs font-medium text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          hari ini
        </Link>
      )}
    </div>
  );
}
