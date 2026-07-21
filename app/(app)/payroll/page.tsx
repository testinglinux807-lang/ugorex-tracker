import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { wibMonthStart } from "@/lib/date";
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

export default async function PayrollPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  // Gaji gudang bulan berjalan → buku kas otomatis (idempoten, dedup)
  await syncGudangSalary();

  const monthStart = wibMonthStart();
  const nextMonth = new Date(
    new Date(monthStart).setMonth(monthStart.getMonth() + 1),
  );
  const period = wibPeriod();
  const monthLabel = periodLabel(period);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());

  const [salesUsers, stores, prospects, paidOrders, stageLogs, gudangUsers, cfg, scoreTargets] =
    await Promise.all([
      prisma.user.findMany({
        where: { role: "SALES" },
        orderBy: { name: "asc" },
        select: { id: true, name: true, commissionPct: true, captainArea: true },
      }),
      prisma.store.findMany({
        select: { id: true, salesId: true, createdAt: true },
      }),
      prisma.prospect.findMany({ select: { storeId: true, stage: true } }),
      prisma.request.findMany({
        where: {
          items: { some: {} },
          paymentStatus: "PAID",
          createdAt: { gte: monthStart },
        },
        select: { storeId: true, total: true },
      }),
      prisma.stageLog.findMany({
        where: { createdAt: { gte: monthStart } },
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
      return computeSalesPayroll(
        {
          salesId: u.id,
          name: u.name,
          level: result.level,
          levelName: result.levelName,
          omzet: kpiValues.omzet,
          pct: u.commissionPct,
          score: result.avgScore,
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
      { userId: e.id, name: e.name, basePay: e.basePay },
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Coins className="h-6 w-6" />
          Payroll
        </h1>
        <p className="text-sm text-neutral-500">
          Gaji sales & gudang · {monthLabel} · sales otomatis dari Tracker
        </p>
      </div>

      <PayrollTabs
        monthLabel={monthLabel}
        today={today}
        sales={sales}
        gudang={gudang}
        employees={employeeList}
        logs={logs}
        lembur={lembur}
        cfg={cfg}
        radiusKm={gudangRadius}
      />
    </div>
  );
}
