import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { STAGES, type Stage } from "@/lib/constants";
import { SalesGrid } from "@/components/SalesGrid";
import { PeriodeFilter } from "@/components/PeriodeFilter";
import { taskGrade } from "@/lib/task-grade";
import { salesGrade, salesLevel } from "@/lib/sales-grade";
import { salesKpi } from "@/lib/sales-kpi";
import { wibMonthStart } from "@/lib/date";
import { parsePeriode, periodeStart, PERIODE_LABEL } from "@/lib/periode";
import { CreateSalesForm } from "@/components/AccountForms";
import {
  SalesInviteManager,
  type SalesInviteItem,
} from "@/components/SalesInviteManager";
import { UserPlus, Users } from "lucide-react";

// Konter dianggap "terbengkalai" kalau > 30 hari tak ada aktivitas funnel.
const NEGLECT_DAYS = 30;

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  // Filter periode omzet & komisi (?periode=minggu|bulan) — loyal/
  // terbengkalai tetap dihitung dari semua waktu.
  const periode = parsePeriode((await searchParams).periode);
  const start = periodeStart(periode);

  // Jendela KPI operasional: bulan berjalan (WIB)
  const monthStart = wibMonthStart();

  const [salesUsers, prospects, saleRows, stores, tasks, saleTotals, kpiOrders, kpiSales, ratingAgg, restokRows] =
    await Promise.all([
    prisma.user.findMany({ where: { role: "SALES" }, orderBy: { name: "asc" } }),
    prisma.prospect.findMany({
      include: { logs: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    // Omzet per konter dalam periode — agregat di DB, bukan tarik semua baris
    prisma.sale.groupBy({
      by: ["storeId"],
      where: start ? { createdAt: { gte: start } } : {},
      _sum: { total: true },
    }),
    prisma.store.findMany({
      select: { id: true, salesId: true, createdAt: true },
    }),
    prisma.task.findMany({
      select: {
        assignedToId: true,
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    // Total omzet per konter semua waktu (agregat di DB) — bahan grade
    // huruf, supaya grade tidak berubah-ubah mengikuti filter periode.
    prisma.sale.groupBy({ by: ["storeId"], _sum: { total: true } }),
    // Bahan 4 KPI operasional bulan ini (lib/sales-kpi.ts): order restok
    // lunas (reorder) & transaksi POS (harga jual rata-rata)
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        createdAt: { gte: monthStart },
      },
      select: {
        storeId: true,
        createdAt: true,
        items: { select: { qty: true } },
      },
    }),
    prisma.sale.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { storeId: true, createdAt: true, qty: true, total: true },
    }),
    // Rating bintang dari owner konter per sales (rata-rata + jumlah ulasan)
    prisma.salesRating.groupBy({
      by: ["salesId"],
      _avg: { stars: true },
      _count: { _all: true },
    }),
    // Omzet RESTOK (order lunas) per konter dalam periode — dasar komisi
    // affiliator: yang dihitung uang toko belanja barang kita, bukan POS.
    prisma.request.groupBy({
      by: ["storeId"],
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
      _sum: { total: true },
    }),
  ]);

  // Link undangan registrasi sales (10 terbaru) — panel Tambah Sales
  const inviteRows = await prisma.salesInvite.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const now = new Date();
  const invites: SalesInviteItem[] = inviteRows.map((inv) => ({
    id: inv.id,
    url: `${appUrl}/daftar-sales/${inv.token}`,
    note: inv.note,
    status: inv.usedAt
      ? "TERPAKAI"
      : inv.expiresAt < now
        ? "KEDALUWARSA"
        : "AKTIF",
    expiresAtLabel: inv.expiresAt.toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
    }),
  }));

  const kpiOrderRows = kpiOrders.map((o) => ({
    storeId: o.storeId,
    createdAt: o.createdAt,
    pcs: o.items.reduce((a, it) => a + it.qty, 0),
  }));

  const ratingBySales = new Map(
    ratingAgg.map((r) => [
      r.salesId,
      {
        avg: Math.round((r._avg.stars ?? 0) * 10) / 10,
        count: r._count._all,
      },
    ]),
  );

  // Omzet per konter
  const revenueByStore = new Map(
    saleRows.map((s) => [s.storeId, s._sum.total ?? 0]),
  );

  // Per konter: tahap terjauh + aktivitas terakhir (ms)
  const nowMs = new Date().getTime();
  const neglectCut = nowMs - NEGLECT_DAYS * 86_400_000;
  const loyalIdx = STAGES.indexOf("LOYALTY");
  const storeAgg = new Map<string, { furthestIdx: number; lastTs: number }>();
  for (const p of prospects) {
    const a = storeAgg.get(p.storeId) ?? { furthestIdx: -1, lastTs: 0 };
    const idx = STAGES.indexOf(p.stage as Stage);
    if (idx > a.furthestIdx) a.furthestIdx = idx;
    const last = p.logs[0];
    const ts = last
      ? new Date(last.createdAt).getTime()
      : new Date(p.updatedAt).getTime();
    if (ts > a.lastTs) a.lastTs = ts;
    storeAgg.set(p.storeId, a);
  }

  // Omzet semua waktu per sales + tertinggi di tim — pembanding grade huruf
  const allTimeByStore = new Map<string, number>();
  for (const t of saleTotals) allTimeByStore.set(t.storeId, t._sum.total ?? 0);
  const allTimeBySales = new Map<string, number>();
  for (const s of stores) {
    if (!s.salesId) continue;
    allTimeBySales.set(
      s.salesId,
      (allTimeBySales.get(s.salesId) ?? 0) + (allTimeByStore.get(s.id) ?? 0),
    );
  }
  const maxRevenue = Math.max(0, ...allTimeBySales.values());

  // Tugas per sales
  const taskStat = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const s = taskStat.get(t.assignedToId) ?? { total: 0, done: 0 };
    s.total++;
    if (t.status === "DONE") s.done++;
    taskStat.set(t.assignedToId, s);
  }

  const restokByStore = new Map(
    restokRows.map((r) => [r.storeId, r._sum.total ?? 0]),
  );

  const rows = salesUsers
    .map((u) => {
      const myStores = stores.filter((s) => s.salesId === u.id);
      let revenue = 0;
      let restok = 0;
      let loyal = 0;
      let terbengkalai = 0;
      for (const s of myStores) {
        revenue += revenueByStore.get(s.id) ?? 0;
        restok += restokByStore.get(s.id) ?? 0;
        const agg = storeAgg.get(s.id);
        if (agg && agg.furthestIdx >= loyalIdx) loyal++;
        // aktivitas terakhir; konter tanpa prospek pakai tanggal dibuatnya
        const lastTs = agg?.lastTs || new Date(s.createdAt).getTime();
        if (lastTs < neglectCut) terbengkalai++;
      }
      const ts = taskStat.get(u.id) ?? { total: 0, done: 0 };
      // Grade KPI dari tugas admin (lib/task-grade.ts) — sama dengan
      // yang tampil di menu Tugas.
      const stars = taskGrade(
        tasks.filter((t) => t.assignedToId === u.id),
      ).stars;
      // Grade huruf leveling S+ … E (lib/sales-grade.ts) — selalu dari
      // data semua waktu, tidak ikut filter periode.
      const g = salesGrade({
        revenue: allTimeBySales.get(u.id) ?? 0,
        maxRevenue,
        konter: myStores.length,
        loyal,
        terbengkalai,
        stars,
        rating: ratingBySales.get(u.id)?.avg ?? null,
      });
      // Level 1-5 (lib/sales-grade.ts) — dari grade huruf; level 5 kalau
      // diangkat admin jadi Sales Captain sebuah wilayah
      const lvl = salesLevel(g.grade, u.captainArea);
      // 4 KPI operasional bulan ini
      const kpi = salesKpi(
        { stores: myStores, orders: kpiOrderRows, sales: kpiSales },
        { from: monthStart, to: null },
      );
      return {
        id: u.id,
        name: u.name,
        phone: u.phone,
        konter: myStores.length,
        revenue,
        loyal,
        terbengkalai,
        taskDone: ts.done,
        taskTotal: ts.total,
        stars,
        grade: g.grade,
        score: g.score,
        level: lvl.level,
        levelName: lvl.name,
        captainArea: u.captainArea,
        kpi,
        rating: ratingBySales.get(u.id) ?? null,
        // Komisi affiliator: persen (diatur admin di detail sales) × omzet
        // RESTOK (order lunas) konternya di periode terpilih — bukan POS.
        pct: u.commissionPct,
        commission: Math.round((restok * u.commissionPct) / 100),
      };
    })
    .sort(
      (a, b) =>
        b.revenue - a.revenue || b.konter - a.konter || b.loyal - a.loyal,
    );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6" />
          Performa Sales
        </h1>
        <p className="text-sm text-neutral-500">
          {salesUsers.length} sales · diurut dari omzet {PERIODE_LABEL[periode]}{" "}
          · klik kartu untuk detail
        </p>
      </div>

      <PeriodeFilter current={periode} basePath="/sales" />

      {/* Tambah akun sales — form yang sama juga ada di Data → Akun Sales */}
      <details className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          <UserPlus className="h-4 w-4 text-neutral-500" />
          Tambah Sales
        </summary>
        <div className="mt-3 max-w-xl">
          <CreateSalesForm />
        </div>
        {/* Atau: kasih link registrasi — calon sales isi datanya sendiri
            dari HP (nama, no HP, password, NIK, GPS titik rumah) */}
        <div className="mt-4 max-w-xl border-t border-neutral-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Atau kirim link registrasi (sekali pakai, 7 hari)
          </p>
          <SalesInviteManager invites={invites} />
        </div>
      </details>

      {salesUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
          Belum ada akun sales. Tambah lewat form di atas.
        </div>
      ) : (
        <SalesGrid rows={rows} />
      )}

      <p className="text-xs text-neutral-400">
        Loyal = konter yang mencapai tahap Loyalty · Terbengkalai = konter &gt;{" "}
        {NEGLECT_DAYS} hari tanpa aktivitas · Tugas = selesai/total tugas dari
        admin · Bintang = grade KPI tugas (tepat waktu penuh, telat setengah,
        lewat tenggat 0) · Grade huruf (S+ terbaik … E) = gabungan omzet semua
        waktu dibanding sales terbaik, porsi konter loyal, keaktifan, dan KPI
        tugas · Komisi = persen affiliator × omzet restok (order lunas)
        konternya di periode terpilih (atur persennya di detail sales).
      </p>
    </div>
  );
}
