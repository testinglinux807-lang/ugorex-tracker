import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FunnelBar } from "@/components/FunnelBar";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { TopProductsInteractive } from "@/components/TopProductsInteractive";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TrackerMap } from "@/components/TrackerMap";
import type { MapPoint, StoreRevenuePoint } from "@/components/MapInner";
import { STAGES, type Stage } from "@/lib/constants";
import { rupiahShort } from "@/lib/format";
import { taskGrade } from "@/lib/task-grade";
import { salesKpi } from "@/lib/sales-kpi";
import { wibMonthStart } from "@/lib/date";
import {
  computeLevel,
  fmtKpi,
  LEVELS,
  LEVEL_MIN,
  KPI_COMPONENTS,
} from "@/lib/sales-kpi-grade";
import { computeSalesKpiValues } from "@/lib/sales-kpi-values";
import { getScoreTargets } from "@/lib/kpi-config";
import {
  getPriorScoreRows,
  recordMonthlyScore,
  wibPeriod,
  periodLabel,
  periodMonthShort,
  rollingRangeLabel,
} from "@/lib/sales-score-history";
import { Skor3Bulan } from "@/components/Skor3Bulan";
import { LEVEL_ICON } from "@/components/Badge";
import { DataTabs } from "@/components/DataTabs";
import { Paginated } from "@/components/Paginated";
import {
  MapPin,
  ArrowRight,
  Truck,
  PlusCircle,
  Navigation,
  Route,
  CheckCircle2,
  TrendingUp,
  Lock,
  Sparkles,
  Target,
} from "lucide-react";

// Konter dianggap "terbengkalai" kalau > 30 hari tak ada aktivitas funnel —
// sama dengan halaman Performa Sales (admin)
const NEGLECT_DAYS = 30;

// Cara konkret menaikkan tiap KPI — ditampilkan di syarat level terkunci
const KPI_HOW: Record<string, string> = {
  omzet: "Dorong konter reorder & naikkan nilai order (bundle/upsell).",
  konversi: "Pastikan tiap konter yang kamu pegang reorder minimal 1× bulan ini.",
  seeding: "Buka konter baru - datangi toko yang belum digarap.",
  closing: "Tindak lanjuti prospek sampai ambil barang (naik ke tahap Conversion).",
  konsistensi: "Catat kunjungan/update funnel tiap hari kerja di app.",
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default async function BerandaPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "ADMIN") redirect("/dashboard");
  if (user.role === "OWNER") redirect("/pos");

  const where = { store: { salesId: user.id } };

  // Jendela 4 KPI operasional: bulan berjalan + bulan lalu (pembanding)
  const monthStart = wibMonthStart();
  const prevMonthStart = wibMonthStart(new Date(monthStart.getTime() - 1));

  const [
    stores,
    prospects,
    sales,
    recentLogs,
    openOrders,
    myTasks,
    saleTotals,
    allStores,
    kpiOrders,
    myRatingAgg,
    otherProspects,
    paidOrderRows,
    payoutAgg,
  ] = await Promise.all([
    prisma.store.findMany({
      where: { salesId: user.id },
      include: { _count: { select: { transactions: true, prospects: true } } },
    }),
    prisma.prospect.findMany({
      where,
      include: {
        store: true,
        // Cukup nama barang — description (daftar HP kompatibel) berat
        product: { select: { name: true } },
        logs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    // Riwayat penuh dipakai banyak hitungan (KPI, grafik, terlaris, stok
    // menipis, peta omzet) — tarik kolom seperlunya saja, tanpa join user
    // penuh (createdBy: true ikut menyeret passwordHash dkk.)
    prisma.sale.findMany({
      where,
      select: {
        id: true,
        storeId: true,
        productId: true,
        productName: true,
        product: { select: { code: true } },
        qty: true,
        total: true,
        createdAt: true,
        store: { select: { name: true, area: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stageLog.findMany({
      where: { prospect: where },
      include: {
        prospect: {
          include: { store: true, product: { select: { name: true } } },
        },
        sales: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // Order restok yang belum selesai — bahan "rute harian" (antar barang)
    prisma.request.findMany({
      where: {
        items: { some: {} },
        status: { notIn: ["COMPLETED", "CANCELLED", "RETURNED"] },
        store: { salesId: user.id },
      },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    // Bahan grade huruf leveling (S+ … E): tugas sendiri untuk KPI, plus
    // omzet semua waktu per konter (agregat di DB) & pemegangnya untuk
    // pembanding omzet vs sales terbaik di tim
    prisma.task.findMany({
      where: { assignedToId: user.id },
      select: {
        status: true,
        priority: true,
        dueDate: true,
        completedAt: true,
      },
    }),
    prisma.sale.groupBy({ by: ["storeId"], _sum: { total: true } }),
    prisma.store.findMany({ select: { id: true, salesId: true } }),
    // Order restok lunas sejak bulan lalu — bahan 4 KPI (lib/sales-kpi.ts)
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        createdAt: { gte: prevMonthStart },
        store: { salesId: user.id },
      },
      select: {
        storeId: true,
        createdAt: true,
        total: true,
        items: { select: { qty: true } },
      },
    }),
    // Rata-rata rating owner untuk sales ini — komponen grade huruf
    prisma.salesRating.aggregate({
      where: { salesId: user.id },
      _avg: { stars: true },
    }),
    // Prospek konter pegangan sales LAIN — dipakai titik abu-abu di peta
    // (penanda "sudah ada yang menawarkan & tertarik", biar tidak dobel
    // digarap). Konter tanpa sales tidak termasuk (masih bebas digarap).
    prisma.prospect.findMany({
      where: {
        store: {
          salesId: { not: user.id },
          lat: { not: null },
          lng: { not: null },
        },
      },
      select: {
        id: true,
        storeId: true,
        stage: true,
        store: {
          select: {
            name: true,
            area: true,
            lat: true,
            lng: true,
            sales: { select: { name: true } },
          },
        },
        product: { select: { name: true } },
        logs: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { result: true },
        },
      },
    }),
    // Omzet order restok yang sudah LUNAS dari konter-mu (semua waktu) —
    // digabung ke kartu "Penjualan Toko" bareng POS, sama seperti Total
    // Penjualan di dashboard admin. Order batal tidak dihitung.
    // Order restok lunas konter-mu (semua waktu) — kartu Omzet + fee per
    // order (fee dihitung per order, konsisten dengan /penghasilan)
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        store: { salesId: user.id },
      },
      select: { total: true },
    }),
    // Total fee yang sudah dicairkan admin — pengurang saldo penghasilan
    prisma.commissionPayout.aggregate({
      where: { salesId: user.id },
      _sum: { amount: true },
    }),
  ]);

  // Ringkasan
  const konterCount = stores.length;
  const visited = stores.filter((s) => s._count.prospects > 0).length;
  const counts = Object.fromEntries(
    STAGES.map((s) => [s, 0]),
  ) as Record<Stage, number>;
  for (const p of prospects) if (p.stage in counts) counts[p.stage as Stage]++;
  const totalProspek = prospects.length;
  const won = counts.CONVERSION + counts.LOYALTY + counts.STAR_SELLER;
  const conversion = totalProspek ? Math.round((won / totalProspek) * 100) : 0;
  // Omzet = HANYA order restok lunas (owner beli stok dari pusat).
  // POS sengaja TIDAK dihitung di sini: penjualan kasir itu data pribadi
  // owner — grafiknya cukup diketahui admin, bukan sales.
  const totalRevenue = paidOrderRows.reduce((a, o) => a + o.total, 0);
  // Penghasilan = fee bagi hasil BELUM DICAIRKAN: total fee (per order,
  // persen × total) − total pencairan admin. Reset ke 0 setelah dibayar.
  const feeAll = paidOrderRows.reduce(
    (a, o) => a + Math.round((o.total * user.commissionPct) / 100),
    0,
  );
  const feeOutstanding = feeAll - (payoutAgg._sum.amount ?? 0);

  // ===== Grade huruf leveling (S+ … E) — rumus & bahan sama persis dengan
  // halaman Performa Sales (admin), lihat lib/sales-grade.ts =====
  const neglectCut = Date.now() - NEGLECT_DAYS * 86_400_000;
  const loyalIdx = STAGES.indexOf("LOYALTY");
  // Per konter: tahap terjauh + aktivitas funnel terakhir (ms)
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
  let loyal = 0;
  let terbengkalai = 0;
  for (const s of stores) {
    const agg = storeAgg.get(s.id);
    if (agg && agg.furthestIdx >= loyalIdx) loyal++;
    // aktivitas terakhir; konter tanpa prospek pakai tanggal dibuatnya
    const lastTs = agg?.lastTs || new Date(s.createdAt).getTime();
    if (lastTs < neglectCut) terbengkalai++;
  }
  // Omzet semua waktu per sales + tertinggi di tim — pembanding komponen omzet
  const allTimeByStore = new Map<string, number>();
  for (const t of saleTotals) allTimeByStore.set(t.storeId, t._sum.total ?? 0);
  const allTimeBySales = new Map<string, number>();
  for (const s of allStores) {
    if (!s.salesId) continue;
    allTimeBySales.set(
      s.salesId,
      (allTimeBySales.get(s.salesId) ?? 0) + (allTimeByStore.get(s.id) ?? 0),
    );
  }
  // ===== Grade & level dari SKOR TERTIMBANG 5 KPI vs target bulan-ideal
  // (lib/sales-kpi-grade.ts). Grade = rata-rata skor 3 bulan (rolling). =====
  const scoreTargets = await getScoreTargets();
  const period = wibPeriod();
  const priorRows = await getPriorScoreRows(user.id, period);
  const priorScores = priorRows.map((r) => r.score);

  // Hari aktif bulan ini (WIB) = jumlah hari sales mencatat kunjungan/update
  const activeLogRows = await prisma.stageLog.findMany({
    where: {
      prospect: { store: { salesId: user.id } },
      createdAt: { gte: monthStart },
    },
    select: { createdAt: true },
  });
  const wibDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
  const activeDays = new Set(activeLogRows.map((l) => wibDay(l.createdAt))).size;

  // KPI operasional bulan ini (seeding & konversi) — lib/sales-kpi.ts
  const kpiNow = salesKpi(
    {
      stores,
      orders: kpiOrders.map((o) => ({
        storeId: o.storeId,
        createdAt: o.createdAt,
        pcs: o.items.reduce((a, it) => a + it.qty, 0),
      })),
      sales,
    },
    { from: monthStart, to: null },
  );
  // Nilai KPI level dari SATU sumber (lib/sales-kpi-values.ts) — rumus
  // sama persis dgn leaderboard /sales, detail sales, & /tugas.
  const kpiValues = computeSalesKpiValues({
    stores,
    ordersMonth: kpiOrders.filter((o) => o.createdAt >= monthStart),
    prospects,
    activeDays,
    monthStart,
  });
  const result = computeLevel(
    kpiValues,
    scoreTargets,
    user.captainArea,
    priorScores,
  );
  // Bekukan skor bulan berjalan ke DB (setelah respons; dedup kalau sama) —
  // jadi bahan rata-rata rolling bulan-bulan berikutnya.
  recordMonthlyScore(user.id, period, result.score);
  const LvlIcon = LEVEL_ICON[result.level as 1 | 2 | 3 | 4 | 5];

  // Bar "Skor 3 Bulan" (kronologis: bulan lama → bulan ini)
  const skorBars = [
    ...priorRows
      .slice()
      .reverse()
      .map((r) => ({ label: periodMonthShort(r.period), score: r.score })),
    { label: periodMonthShort(period), score: result.score, current: true },
  ];
  const skorAvg =
    skorBars.reduce((a, b) => a + b.score, 0) / skorBars.length;

  // Peta level → grade minimum (untuk penjelasan level terkunci)
  const LEVEL_BENEFIT: Record<number, string> = {
    1: "Akses dasar - katalog & harga reseller Ugorex.",
    2: "Bisa seeding konter baru & dapat komisi tiap reorder.",
    3: "Sales andalan - prioritas restok produk fast-moving.",
    4: "Top performer tim - akses produk baru duluan & bonus.",
  };

  // ===== Coach: level berikutnya, progres, kontribusi KPI =====
  const nextLevelInfo = result.nextLevel
    ? { level: result.nextLevel, name: result.nextLevelName ?? "" }
    : null;
  const levelPct = result.progress; // 0-100 posisi avgScore menuju ambang berikutnya
  const bulanIni = periodLabel(period); // mis. "Jul 2026"
  const rataLabel = rollingRangeLabel(period, result.monthsUsed); // rentang rata-rata
  // Poin rata-rata yang masih kurang untuk tembus level berikutnya
  const poinKurang =
    result.nextThreshold != null
      ? Math.max(0, result.nextThreshold - result.avgScore)
      : 0;
  // Rincian per-KPI (kontribusi ke skor bulan ini)
  const milestones = result.milestones.map((m) => ({
    key: m.key,
    label: `${m.label} capai ${fmtKpi(m.target, m.unit)}`,
    done: m.done,
    pct: m.pct,
    prog: `${fmtKpi(m.value, m.unit)}/${fmtKpi(m.target, m.unit)}`,
  }));
  const msDoneCount = milestones.filter((m) => m.done).length;
  const nextMsKey =
    [...milestones].filter((m) => !m.done).sort((a, b) => b.pct - a.pct)[0]
      ?.key ?? null;

  // Strategi rule-based dari KPI vs target (Today's Focus)
  const strategi = (() => {
    const t = result.nextTargets;
    if (!t)
      return { judul: "Jaga momentum", note: "Pertahankan performa puncakmu." };
    if (kpiValues.omzet < t.omzet * 0.3)
      return {
        judul: "Bundle + Upsell",
        note: "Omzet masih rendah - naikkan nilai order rata-rata konter.",
      };
    if (kpiValues.closing < t.closing * 0.6)
      return {
        judul: "Fokus closing",
        note: "Banyak prospek belum closing - tindak lanjuti yang hangat.",
      };
    if (kpiValues.seeding < t.seeding)
      return {
        judul: "Buka konter baru",
        note: "Kejar target seeding - cari konter yang belum digarap.",
      };
    return {
      judul: "Jaga momentum",
      note: "Pertahankan reorder konter aktif & rating owner.",
    };
  })();

  // Target harian = konter belum reorder ÷ sisa hari bulan ini
  const nowDate = new Date();
  const daysInMonth = new Date(
    nowDate.getFullYear(),
    nowDate.getMonth() + 1,
    0,
  ).getDate();
  const sisaHari = Math.max(1, daysInMonth - nowDate.getDate() + 1);
  const belumReorder = Math.max(0, konterCount - kpiNow.aktif);
  const targetHarian = Math.max(1, Math.ceil(belumReorder / sisaHari));

  // Penjualan untuk grafik & produk terlaris
  const salesPoints = sales.map((s) => ({
    ts: new Date(s.createdAt).getTime(),
    total: s.total,
  }));

  // Terjual per barang per toko (untuk stok menipis)
  const soldMap = new Map<string, number>();
  for (const s of sales) {
    if (!s.productId) continue;
    const k = `${s.storeId}__${s.productId}`;
    soldMap.set(k, (soldMap.get(k) ?? 0) + s.qty);
  }

  // Stok menipis (≤10) di konter-konter sales ini
  const lowStockItems = prospects
    .map((p) => {
      const sold = soldMap.get(`${p.storeId}__${p.productId}`) ?? 0;
      return {
        storeId: p.storeId,
        store: p.store.name,
        lat: p.store.lat,
        lng: p.store.lng,
        product: p.product.name,
        remaining: p.stock - sold,
        stock: p.stock,
      };
    })
    .filter((x) => x.stock > 0 && x.remaining > 0 && x.remaining <= 10)
    .sort((a, b) => a.remaining - b.remaining);
  const lowStock = lowStockItems.length;
  const lowStockStores = new Set(lowStockItems.map((x) => x.storeId)).size;

  // ===== Rute harian: gabungan logistik (antar restok) & hunting =====
  // RESTOK (kuning) = order dibayar/di jalan yang harus diantar;
  // RUTIN (biru)    = konter existing yang stoknya menipis, layak disambangi;
  // CLOSING (hijau) = konter tanpa prospek, target kunjungan closing.
  type RuteStop = {
    key: string;
    type: "RESTOK" | "RUTIN" | "CLOSING";
    store: string;
    sub: string;
    href: string;
    lat: number | null;
    lng: number | null;
  };
  // READY = barang sudah dipacking gudang, tinggal dipickup & diantar sales
  const antarCount = openOrders.filter((o) => o.status === "READY").length;
  const ruteRestok: RuteStop[] = openOrders
    .filter((o) => o.status === "READY" || o.status === "SHIPPED")
    .map((o) => ({
      key: `order-${o.id}`,
      type: "RESTOK",
      store: o.store.name,
      sub:
        o.status === "SHIPPED"
          ? `#${o.id.slice(-8).toUpperCase()} · di jalan - report saat sampai`
          : `#${o.id.slice(-8).toUpperCase()} · ${rupiah(o.total)} · siap dipickup di gudang`,
      href: `/order?focus=${o.id}`,
      lat: o.store.lat,
      lng: o.store.lng,
    }));
  const lowByStore = new Map<
    string,
    { store: string; n: number; lat: number | null; lng: number | null }
  >();
  for (const x of lowStockItems) {
    const cur = lowByStore.get(x.storeId);
    if (cur) cur.n += 1;
    else lowByStore.set(x.storeId, { store: x.store, n: 1, lat: x.lat, lng: x.lng });
  }
  const ruteRutin: RuteStop[] = [...lowByStore].map(([storeId, v]) => ({
    key: `rutin-${storeId}`,
    type: "RUTIN",
    store: v.store,
    sub: `${v.n} barang menipis - tawarkan restok`,
    href: `/konter/${storeId}`,
    lat: v.lat,
    lng: v.lng,
  }));
  const ruteClosing: RuteStop[] = stores
    .filter((s) => s._count.prospects === 0)
    .map((s) => ({
      key: `closing-${s.id}`,
      type: "CLOSING",
      store: s.name,
      sub: `${s.area ?? "Area belum diisi"} · belum ada prospek`,
      href: `/konter/${s.id}`,
      lat: s.lat,
      lng: s.lng,
    }));
  const ruteStops = [...ruteRestok, ...ruteRutin, ...ruteClosing];

  const STOP_BADGE: Record<RuteStop["type"], { label: string; cls: string }> = {
    RESTOK: { label: "Restok", cls: "border-amber-300 bg-amber-50 text-amber-700" },
    RUTIN: { label: "Rutin", cls: "border-sky-300 bg-sky-50 text-sky-700" },
    CLOSING: { label: "Closing", cls: "border-green-300 bg-green-50 text-green-700" },
  };

  // Map points
  const points: MapPoint[] = prospects
    .filter((p) => p.store.lat != null && p.store.lng != null)
    .map((p) => ({
      id: p.id,
      storeId: p.storeId,
      product: p.product.name,
      store: p.store.name,
      area: p.store.area,
      stage: p.stage,
      result: p.logs[0]?.result ?? "NEUTRAL",
      lat: p.store.lat as number,
      lng: p.store.lng as number,
    }));

  // Konter garapan sales lain yang sudah tertarik / sudah beli — jadi titik
  // ABU-ABU di peta (info saja, tidak ikut filter Tertarik/Tidak).
  const takenStages = ["CONVERSION", "LOYALTY", "STAR_SELLER"];
  const otherPoints: MapPoint[] = otherProspects
    .filter(
      (p) => p.logs[0]?.result === "POSITIVE" || takenStages.includes(p.stage),
    )
    .map((p) => ({
      id: p.id,
      storeId: p.storeId,
      product: p.product.name,
      store: p.store.name,
      area: p.store.area,
      stage: p.stage,
      result: p.logs[0]?.result ?? "NEUTRAL",
      lat: p.store.lat as number,
      lng: p.store.lng as number,
      otherSales: p.store.sales?.name ?? "sales lain",
    }));
  const mapPoints = [...points, ...otherPoints];

  // Titik rumah sales (diisi admin saat registrasi/edit akun) — pusat
  // lingkaran radius kerja 7 km di peta.
  const homePoint =
    user.homeLat != null && user.homeLng != null
      ? { lat: user.homeLat, lng: user.homeLng }
      : null;

  // Konter yang benar-benar berkontribusi ke penjualan (punya transaksi
  // Sale) — ditampilkan sebagai bubble di peta, ukuran = besar revenue-nya.
  const revenueByStore = new Map<string, number>();
  for (const s of sales) {
    revenueByStore.set(s.storeId, (revenueByStore.get(s.storeId) ?? 0) + s.total);
  }
  const storePoints: StoreRevenuePoint[] = stores
    .filter((s) => s.lat != null && s.lng != null && (revenueByStore.get(s.id) ?? 0) > 0)
    .map((s) => ({
      storeId: s.id,
      store: s.name,
      area: s.area,
      lat: s.lat as number,
      lng: s.lng as number,
      revenue: revenueByStore.get(s.id) ?? 0,
    }));

  // Aktivitas: funnel + penjualan
  const fmtDate = (d: Date) =>
    new Date(d).toLocaleDateString("id-ID", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  const funnelActs = recentLogs.map((log) => ({
    id: `log-${log.id}`,
    type: "FUNNEL" as const,
    ts: new Date(log.createdAt).getTime(),
    href: `/konter/${log.prospect.storeId}`,
    title: `${log.prospect.product.name} @ ${log.prospect.store.name}`,
    subtitle: log.note,
    by: log.sales?.name ?? "-",
    date: fmtDate(log.createdAt),
    stage: log.stage,
    result: log.result,
  }));
  const saleActs = sales.slice(0, 40).map((s) => ({
    id: `sale-${s.id}`,
    type: "SALE" as const,
    ts: new Date(s.createdAt).getTime(),
    href: `/konter/${s.storeId}`,
    title: `${s.productName} @ ${s.store.name}`,
    subtitle: `Terjual ${s.qty} unit · ${rupiah(s.total)}`,
    by: s.createdBy?.name ?? "Owner",
    date: fmtDate(s.createdAt),
  }));
  const activities = [...funnelActs, ...saleActs]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 60);

  return (
    <div className="space-y-6">
      {/* ===== HERO COACH (dark): insight naik level + progres + ring grade ===== */}
      <section className="overflow-hidden rounded-2xl bg-neutral-900 p-5 text-white sm:p-6">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          {/* Kiri: coach insight + fokus + progres level.
              Mobile: gradebox naik ke atas (order), desktop: coach di kiri. */}
          <div className="order-2 lg:order-1">
            <span className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] font-medium text-brand">
              <Sparkles className="h-3 w-3" /> Coach Ugorex · Halo,{" "}
              {user.name.split(" ")[0]}
            </span>
            <h1 className="text-xl font-bold leading-snug sm:text-2xl">
              {nextLevelInfo ? (
                <>
                  Tinggal{" "}
                  <span className="text-brand">{poinKurang} poin</span> lagi
                  buat naik ke{" "}
                  <span className="text-brand">{nextLevelInfo.name}</span>
                </>
              ) : (
                <>
                  Kamu di level tertinggi -{" "}
                  <span className="text-brand">{result.levelName}</span>
                </>
              )}
            </h1>
            <p className="mt-2 max-w-lg text-sm text-neutral-400">
              {nextLevelInfo
                ? `Naik level = ${(LEVELS.find((l) => l.level === nextLevelInfo.level)?.benefit ?? "").toLowerCase()}`
                : "Pertahankan performa biar level & komisimu terjaga."}
            </p>

            {/* Fokus hari ini */}
            <div className="mt-4 max-w-lg rounded-xl border border-white/10 border-l-[3px] border-l-brand bg-white/5 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-brand">
                Fokus hari ini
              </p>
              <p className="mt-1 text-sm text-neutral-100">
                Strategi <b className="text-brand">{strategi.judul}</b> -{" "}
                {strategi.note}
              </p>
            </div>

            {/* Progres ke level berikutnya */}
            {nextLevelInfo && (
              <div className="mt-5 max-w-lg">
                <div className="mb-1.5 flex justify-between text-xs font-medium">
                  <span>
                    Lv. {result.level} {result.levelName}
                  </span>
                  <span className="text-brand">
                    Lv. {nextLevelInfo.level} {nextLevelInfo.name} →
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-dark to-brand"
                    style={{ width: `${levelPct}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-neutral-400">
                  Skor rata-rata{" "}
                  <b className="font-mono text-white">{result.avgScore}</b>/100
                  {result.monthsUsed > 1
                    ? ` (rata ${rataLabel})`
                    : ` (${bulanIni})`}{" "}
                  -{" "}
                  <span className="font-semibold text-brand">
                    butuh {result.nextThreshold} buat naik
                  </span>
                  .
                  {belumReorder > 0 && (
                    <>
                      {" "}
                      Target hari ini{" "}
                      <b className="font-mono text-white">{targetHarian}</b>{" "}
                      konter reorder.
                    </>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Kanan: gradebox — ring skor + tier + milestone */}
          <div className="order-1 self-start rounded-2xl border border-white/10 bg-white/5 p-5 lg:order-2">
            {/* Mobile: ring + info ditumpuk & rata tengah; desktop: sejajar */}
            <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
              <div
                className="relative grid h-20 w-20 shrink-0 place-items-center rounded-full"
                style={{
                  background: `conic-gradient(#d2ec0a ${levelPct}%, rgba(255,255,255,.12) 0)`,
                }}
              >
                <div className="absolute inset-[6px] rounded-full bg-neutral-900" />
                <div className="relative text-center">
                  <p className="text-[26px] font-extrabold leading-none text-brand">
                    {result.grade}
                  </p>
                  <p className="mt-0.5 text-[9px] uppercase tracking-wider text-neutral-500">
                    Grade
                  </p>
                </div>
              </div>
              <div className="min-w-0">
                <p className="flex items-center justify-center gap-1.5 text-base font-bold sm:justify-start">
                  <LvlIcon className="h-4 w-4 shrink-0 text-brand" />
                  Lv. {result.level} · {result.levelName}
                </p>
                <p className="mt-1 text-xs text-neutral-400">
                  Grade <b className="text-white">{result.grade}</b>
                  {nextLevelInfo ? ` · ${levelPct}% menuju naik` : " · puncak"}
                </p>
                <p className="mt-0.5 text-[11px] text-neutral-500">
                  {LEVELS.find((l) => l.level === result.level)?.benefit}
                </p>
              </div>
            </div>
            <div className="mt-4 flex justify-between border-t border-white/10 pt-3 text-xs">
              <span className="text-neutral-400">Skor {bulanIni}</span>
              <span className="font-semibold text-brand">
                {result.score}/100 · {msDoneCount}/{milestones.length} KPI
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ===== Skor 3 Bulan — bar rolling + ambang naik level ===== */}
      {!result.captain && (
        <Skor3Bulan
          bars={skorBars}
          avg={skorAvg}
          threshold={result.nextThreshold}
          nextLevelName={result.nextLevelName}
        />
      )}

      {/* ===== Today's Focus (lime) — aksi hari ini ===== */}
      <section className="rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-5 text-neutral-900">
        <h2 className="flex items-center gap-1.5 text-base font-extrabold">
          <Target className="h-4 w-4" /> Fokus Hari Ini
        </h2>
        <p className="text-xs text-neutral-800/70">
          Kerjakan ini biar skor & level cepat naik
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-neutral-900/10 bg-white/55 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-800/60">
              Target hari ini
            </p>
            <p className="mt-1 text-xl font-extrabold">
              {targetHarian} <span className="text-sm font-semibold">konter</span>
            </p>
            <p className="mt-1 text-xs text-neutral-800/70">
              {belumReorder} konter belum reorder bulan ini
            </p>
          </div>
          <div className="rounded-xl border border-neutral-900/10 bg-white/55 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-800/60">
              Strategi
            </p>
            <p className="mt-1 text-base font-extrabold leading-tight">
              {strategi.judul}
            </p>
            <p className="mt-1 text-xs text-neutral-800/70">{strategi.note}</p>
          </div>
          <Link
            href="/konter"
            className="rounded-xl border border-neutral-900/10 bg-neutral-900 p-3.5 text-white transition hover:opacity-90"
          >
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand">
              KPI paling perlu digenjot
            </p>
            <p className="mt-1 text-base font-extrabold leading-tight">
              {nextMsKey
                ? result.milestones.find((m) => m.key === nextMsKey)?.label
                : "Semua KPI capai target"}
            </p>
            <p className="mt-1 text-xs text-neutral-400">Buka konter saya →</p>
          </Link>
        </div>
      </section>

      {/* ===== KPI Bulan Ini = matrix utama (status vs target admin) ===== */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-400">
            Performa Bulan Ini
          </p>
          <p className="text-[11px] text-neutral-500">
            {bulanIni} ·{" "}
            <span className="font-semibold text-brand-dark">
              skor {result.score}/100
            </span>
          </p>
        </div>
        {/* Hanya 4 KPI operasional di sini (Konsistensi cuma di Rincian skor
            bawah) — target = bulan ideal (skor 100%) */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {result.milestones
            .filter((p) => p.key !== "konsistensi")
            .map((p) => {
            // Status dari progres ke target: ≥100 Excellent, ≥60 On Track, else Behind
            const st =
              p.pct >= 100
                ? {
                    label: "Excellent",
                    badge: "bg-brand/15 text-brand-dark",
                    bar: "bg-brand-dark",
                    accent: "bg-brand-dark",
                  }
                : p.pct >= 60
                  ? {
                      label: "On Track",
                      badge: "bg-green-100 text-green-700",
                      bar: "bg-green-500",
                      accent: "bg-green-500",
                    }
                  : {
                      label: "Behind",
                      badge: "bg-red-100 text-red-600",
                      bar: "bg-red-500",
                      accent: "bg-red-400",
                    };
            return (
              <div
                key={p.key}
                className="relative overflow-hidden rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-sm"
              >
                <span
                  className={`absolute left-0 top-4 bottom-4 w-1 rounded-r ${st.accent}`}
                />
                <div className="flex items-start justify-between gap-1">
                  <p className="text-[11px] leading-tight text-neutral-500">
                    {p.label}
                  </p>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${st.badge}`}
                  >
                    {st.label}
                  </span>
                </div>
                <p className="mt-1 truncate text-xl font-bold">
                  {fmtKpi(p.value, p.unit)}
                </p>
                <p className="text-[11px] text-neutral-400">
                  target {fmtKpi(p.target, p.unit)}
                </p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${st.bar}`}
                    style={{ width: `${p.pct}%` }}
                  />
                </div>
                <p className="mt-1 font-mono text-[10px] text-neutral-400">
                  {p.pct}% ke target
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ===== Ringkasan: 6 kartu seragam (omzet, penghasilan, konter,
          prospek, konversi, stok) — 3 kolom di desktop, 2 di HP ===== */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900">
          <p className="text-xs text-neutral-500">Omzet</p>
          <p className="mt-1 truncate text-2xl font-bold">
            {rupiahShort(totalRevenue)}
          </p>
          <p className="text-xs text-neutral-400">
            order restok lunas konter-mu
          </p>
        </div>
        <Link
          href="/penghasilan"
          className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 transition hover:ring-2 hover:ring-brand"
        >
          <p className="text-xs text-neutral-500">Penghasilan Saya</p>
          <p className="mt-1 truncate text-2xl font-bold text-brand-dark">
            {rupiahShort(feeOutstanding)}
          </p>
          <p className="text-xs text-neutral-400">
            {user.commissionPct > 0
              ? `belum dicairkan · fee ${user.commissionPct}% · riwayat →`
              : "fee belum diatur admin · riwayat →"}
          </p>
        </Link>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900">
          <p className="text-xs text-neutral-500">Konter Saya</p>
          <p className="mt-1 text-2xl font-bold">{konterCount}</p>
          <p className="text-xs text-neutral-400">{visited} dikunjungi</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900">
          <p className="text-xs text-neutral-500">Prospek</p>
          <p className="mt-1 text-2xl font-bold">{totalProspek}</p>
          <p className="text-xs text-neutral-400">{won} closing</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900">
          <p className="text-xs text-neutral-500">Konversi</p>
          <p className="mt-1 text-2xl font-bold">{conversion}%</p>
          <p className="text-xs text-neutral-400">Conversion ke atas</p>
        </div>
        <Link
          href="/konter"
          className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900 transition hover:ring-2 hover:ring-brand"
        >
          <p className="text-xs text-neutral-500">Stok Menipis</p>
          <p
            className={`mt-1 text-2xl font-bold ${
              lowStock > 0 ? "text-amber-600" : ""
            }`}
          >
            {lowStock}
            <span className="ml-1 text-sm font-medium text-neutral-400">
              unit
            </span>
          </p>
          <p className="text-xs text-neutral-400">
            {lowStock > 0 ? `di ${lowStockStores} konter` : "Semua aman"}
          </p>
        </Link>
      </section>

      {/* ===== Cara naik level: tangga level (terkunci bisa diklik) +
          ambang grade + progres komponen KPI vs target admin ===== */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-neutral-500" />
          <h2 className="font-semibold">Cara Naik Level</h2>
        </div>
        <p className="mb-3 text-xs text-neutral-400">
          Kamu naik ke sebuah level kalau MEMENUHI SEMUA target level itu
          (di-set admin per level). Ketuk level terkunci untuk lihat syaratnya.
        </p>

        {/* Tangga level 1-4. Level terkunci = <details> yang bisa diketuk.
            items-start: kartu yang tidak dibuka TIDAK ikut memanjang saat
            kartu sebelahnya di-expand (biar tak ada kotak putih kosong). */}
        <div className="mb-4 grid grid-cols-1 items-start gap-2 sm:grid-cols-2">
          {LEVELS.map((l) => {
            const Icon = LEVEL_ICON[l.level as 1 | 2 | 3 | 4 | 5];
            const current = result.level === l.level;
            const passed = result.level > l.level;
            const locked = result.level < l.level;
            const head = (
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                {locked ? (
                  <Lock className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                ) : (
                  <Icon
                    className={`h-3.5 w-3.5 shrink-0 ${current ? "text-brand-dark" : "text-neutral-400"}`}
                  />
                )}
                Lv. {l.level} {l.name}
                <span
                  className={`ml-auto text-[10px] font-bold uppercase tracking-wide ${
                    current
                      ? "text-brand-dark"
                      : passed
                        ? "text-neutral-400"
                        : "text-neutral-400"
                  }`}
                >
                  {passed ? "Terlewati" : current ? "Sekarang" : "Terkunci"}
                </span>
              </span>
            );
            const boxCls = `rounded-xl border p-2.5 ${
              current
                ? "border-brand bg-brand/10"
                : passed
                  ? "border-neutral-200 bg-neutral-50"
                  : "border-neutral-200"
            }`;
            // Level terkunci → bisa diketuk untuk lihat syarat
            if (locked) {
              return (
                <details key={l.level} className={`ug-acc ${boxCls}`}>
                  <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    {head}
                  </summary>
                  <div className="mt-2 space-y-2.5 border-t border-neutral-200 pt-2.5">
                    <p className="text-[11px] font-semibold text-neutral-700">
                      Naik ke Lv. {l.level} butuh rata-rata skor{" "}
                      {LEVEL_MIN[l.level]}/100 - genjot KPI ini:
                    </p>
                    {KPI_COMPONENTS.map((c) => {
                      const target = scoreTargets[c.key] ?? 0;
                      const value = kpiValues[c.key];
                      const done = value >= target;
                      const pct =
                        target > 0
                          ? Math.min(100, Math.round((value / target) * 100))
                          : 100;
                      return (
                        <div key={c.key}>
                          <div className="flex items-center justify-between gap-2 text-[11px]">
                            <span
                              className={`flex items-center gap-1.5 font-medium ${done ? "text-brand-dark" : "text-neutral-700"}`}
                            >
                              {done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-neutral-300" />
                              )}
                              {c.label}
                            </span>
                            <span className="shrink-0 font-mono text-neutral-500">
                              {fmtKpi(value, c.unit)} /{" "}
                              <b className="text-neutral-800">
                                {fmtKpi(target, c.unit)}
                              </b>
                            </span>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-neutral-100">
                            <div
                              className={`h-full rounded-full ${done ? "bg-brand-dark" : "bg-neutral-400"}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <p className="mt-0.5 text-[10px] leading-snug text-neutral-400">
                            Cara: {KPI_HOW[c.key]}
                          </p>
                        </div>
                      );
                    })}
                    <p className="border-t border-dashed border-neutral-200 pt-1.5 text-[11px] text-neutral-500">
                      <span className="font-semibold text-neutral-700">
                        Hadiah:
                      </span>{" "}
                      {l.benefit}
                    </p>
                  </div>
                </details>
              );
            }
            return (
              <div key={l.level} className={boxCls}>
                {head}
                <p className="mt-1 text-[11px] text-neutral-400">{l.benefit}</p>
              </div>
            );
          })}
        </div>

        {/* KPI vs target bulan-ideal (tiap KPI capai target = skor penuh) —
            gaya checklist. "Berikutnya" = belum beres, paling dekat. */}
        <div className="mb-2 mt-1 flex items-center gap-2 text-xs font-semibold">
          {nextLevelInfo
            ? `Genjot KPI buat naik ke Lv. ${nextLevelInfo.level} ${nextLevelInfo.name}`
            : "Semua target - pertahankan"}
          <span className="rounded-full bg-brand/15 px-2 py-0.5 text-[10px] font-bold text-brand-dark">
            {msDoneCount}/{milestones.length} target
          </span>
        </div>
        <div className="mb-4 space-y-2">
          {milestones.map((m) => {
            const isNext = !m.done && m.key === nextMsKey;
            return (
              <div
                key={m.key}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  m.done
                    ? "border-brand/40 bg-brand/10"
                    : isNext
                      ? "border-brand-dark bg-brand/5"
                      : "border-neutral-200"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                    m.done
                      ? "bg-brand text-neutral-900"
                      : isNext
                        ? "border-2 border-brand-dark text-brand-dark"
                        : "bg-neutral-100 text-neutral-400"
                  }`}
                >
                  {m.done ? "✓" : isNext ? "→" : "•"}
                </span>
                <span
                  className={`min-w-0 flex-1 text-sm font-medium ${
                    m.done || isNext ? "text-neutral-900" : "text-neutral-500"
                  }`}
                >
                  {m.label}
                </span>
                {isNext && (
                  <span className="shrink-0 rounded-full bg-brand/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-dark">
                    Berikutnya
                  </span>
                )}
                <span
                  className={`shrink-0 font-mono text-xs font-bold ${
                    m.done ? "text-brand-dark" : "text-neutral-400"
                  }`}
                >
                  {m.prog}
                  {m.done ? " ✓" : ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progres tiap komponen KPI vs target bulan-ideal (skor 100%) */}
        <p className="mb-2 text-xs font-semibold text-neutral-700">
          Rincian 5 komponen{" "}
          <span className="font-normal text-neutral-400">
            (skor {bulanIni} {result.score}/100)
          </span>
        </p>
        <div className="space-y-3">
          {result.milestones.map((p) => (
            <div key={p.key}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className="font-medium text-neutral-700">{p.label}</span>
                <span className="shrink-0 text-neutral-400">
                  {fmtKpi(p.value, p.unit)} / {fmtKpi(p.target, p.unit)} ·{" "}
                  <span
                    className={`font-semibold ${p.done ? "text-brand-dark" : "text-neutral-700"}`}
                  >
                    {p.pct}%
                  </span>
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-100">
                <div
                  className={`h-full rounded-full ${p.done ? "bg-brand-dark" : "bg-neutral-900"}`}
                  style={{ width: `${p.pct}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-neutral-400">{p.hint}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== Rute Hari Ini: logistik + hunting dalam satu daftar ===== */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="mb-1 flex items-center gap-2">
          <Route className="h-4 w-4 text-neutral-500" />
          <h2 className="font-semibold">Rute Hari Ini</h2>
          {ruteStops.length > 0 && (
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-neutral-900">
              {ruteStops.length}
            </span>
          )}
        </div>
        <p className="mb-3 text-xs text-neutral-400">
          Antar restok, kunjungan rutin, dan target closing - sekali lihat
          sebelum berangkat
        </p>

        {/* CTA utama: kerjaan paling sering & paling gampang lupa dikonfirmasi */}
        <div className="mb-3 flex gap-2">
          <Link
            href="/tugas"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand py-2.5 text-sm font-semibold text-neutral-900 hover:opacity-90"
          >
            <Truck className="h-4 w-4" />
            Antar Restok{antarCount > 0 ? ` (${antarCount})` : ""}
          </Link>
          <Link
            href="/konter/baru"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-neutral-300 py-2.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <PlusCircle className="h-4 w-4" />
            Konter Baru
          </Link>
        </div>

        {ruteStops.length === 0 ? (
          <div className="flex items-center justify-center gap-2 rounded-lg bg-neutral-50 py-6 text-sm text-neutral-400">
            <CheckCircle2 className="h-4 w-4 text-brand-dark" />
            Tidak ada rute hari ini - semua beres.
          </div>
        ) : (
          <Paginated
            perPage={5}
            className="divide-y divide-neutral-100"
            items={ruteStops.map((stop) => {
              const badge = STOP_BADGE[stop.type];
              const maps =
                stop.lat != null && stop.lng != null
                  ? `https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`
                  : null;
              return (
                <div key={stop.key} className="flex items-center gap-2 py-2.5">
                  <span
                    className={`w-16 shrink-0 rounded-full border px-2 py-0.5 text-center text-[10px] font-bold ${badge.cls}`}
                  >
                    {badge.label}
                  </span>
                  <Link href={stop.href} className="min-w-0 flex-1 hover:underline">
                    <span className="block truncate text-sm font-medium">
                      {stop.store}
                    </span>
                    <span className="block truncate text-xs text-neutral-400">
                      {stop.sub}
                    </span>
                  </Link>
                  {maps && (
                    <a
                      href={maps}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={`Rute ke ${stop.store}`}
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 text-neutral-500 hover:bg-neutral-100"
                    >
                      <Navigation className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              );
            })}
          />
        )}
      </section>

      {/* Di HP panel-panel dipisah 3 tab; desktop tetap grid seperti biasa:
          Funnel · Grafik · Produk lalu Peta (2 kolom) + Aktivitas. */}
      <DataTabs
        gridClassName="lg:grid-cols-3"
        tabs={[
          { key: "statistik", label: "Statistik" },
          { key: "peta", label: "Peta" },
          { key: "aktivitas", label: "Aktivitas" },
        ]}
        sections={[
          {
            tab: "statistik",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Funnel Konter</h2>
                  <span className="text-xs text-neutral-400">
                    {totalProspek} prospek
                  </span>
                </div>
                <div className="flex flex-1 flex-col justify-center">
                  <FunnelBar counts={counts} total={totalProspek} />
                </div>
              </div>
            ),
          },
          {
            tab: "statistik",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold">Grafik Penjualan</h2>
                <div className="flex-1">
                  <SalesTrendChart sales={salesPoints} />
                </div>
              </div>
            ),
          },
          {
            tab: "statistik",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="mb-3 font-semibold">Produk Terlaris</h2>
                <div className="flex-1">
                  <TopProductsInteractive sales={sales} />
                </div>
              </div>
            ),
          },
          {
            tab: "peta",
            className: "h-full lg:col-span-2",
            node: (
              <div className="flex h-full flex-col">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <MapPin className="h-4 w-4" />
                  Sebaran Konter - Karawang
                </div>
                <TrackerMap
                  points={mapPoints}
                  storePoints={storePoints}
                  homePoints={homePoint ? [homePoint] : []}
                />
              </div>
            ),
          },
          {
            tab: "aktivitas",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Aktivitas Terbaru</h2>
                  <Link
                    href="/konter"
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:underline"
                  >
                    Konter Saya
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <ActivityFeed activities={activities} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
