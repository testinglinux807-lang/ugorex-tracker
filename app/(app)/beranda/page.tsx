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
  salesGrade,
  salesLevel,
  gradePartsSummary,
  GRADE_DESC,
} from "@/lib/sales-grade";
import { GradeBadge, LEVEL_ICON } from "@/components/Badge";
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
} from "lucide-react";

// Konter dianggap "terbengkalai" kalau > 30 hari tak ada aktivitas funnel —
// sama dengan halaman Performa Sales (admin)
const NEGLECT_DAYS = 30;

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
  ] = await Promise.all([
    prisma.store.findMany({
      where: { salesId: user.id },
      include: { _count: { select: { transactions: true, prospects: true } } },
    }),
    prisma.prospect.findMany({
      where,
      include: {
        store: true,
        product: true,
        logs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    }),
    prisma.sale.findMany({
      where,
      include: { store: true, createdBy: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stageLog.findMany({
      where: { prospect: where },
      include: {
        prospect: { include: { store: true, product: true } },
        sales: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    // Order restok yang belum selesai — bahan "rute harian" (antar barang)
    prisma.request.findMany({
      where: {
        items: { some: {} },
        status: { not: "COMPLETED" },
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
        createdAt: { gte: prevMonthStart },
        store: { salesId: user.id },
      },
      select: {
        storeId: true,
        createdAt: true,
        items: { select: { qty: true } },
      },
    }),
  ]);

  // Ringkasan
  const konterCount = stores.length;
  const visited = stores.filter((s) => s._count.prospects > 0).length;
  const counts: Record<Stage, number> = {
    AWARENESS: 0,
    INTEREST: 0,
    DESIRE: 0,
    ACTION: 0,
    LOYALTY: 0,
  };
  for (const p of prospects) if (p.stage in counts) counts[p.stage as Stage]++;
  const totalProspek = prospects.length;
  const won = counts.ACTION + counts.LOYALTY;
  const conversion = totalProspek ? Math.round((won / totalProspek) * 100) : 0;
  const totalRevenue = sales.reduce((a, s) => a + s.total, 0);

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
  const myGrade = salesGrade({
    revenue: allTimeBySales.get(user.id) ?? 0,
    maxRevenue: Math.max(0, ...allTimeBySales.values()),
    konter: konterCount,
    loyal,
    terbengkalai,
    stars: taskGrade(myTasks).stars,
  });
  // Level 1-5 — dari grade huruf; level 5 kalau diangkat jadi Sales Captain
  const lvl = salesLevel(myGrade.grade, user.captainArea);
  const LvlIcon = LEVEL_ICON[lvl.level];

  // 4 KPI operasional: bulan ini vs bulan lalu (lib/sales-kpi.ts)
  const kpiInput = {
    stores,
    orders: kpiOrders.map((o) => ({
      storeId: o.storeId,
      createdAt: o.createdAt,
      pcs: o.items.reduce((a, it) => a + it.qty, 0),
    })),
    sales,
  };
  const kpiNow = salesKpi(kpiInput, { from: monthStart, to: null });
  const kpiPrev = salesKpi(kpiInput, { from: prevMonthStart, to: monthStart });

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
  const antarCount = openOrders.filter(
    (o) => o.status === "PENDING" && o.paymentStatus === "PAID",
  ).length;
  const ruteRestok: RuteStop[] = openOrders
    .filter(
      (o) =>
        (o.status === "PENDING" && o.paymentStatus === "PAID") ||
        o.status === "SHIPPED",
    )
    .map((o) => ({
      key: `order-${o.id}`,
      type: "RESTOK",
      store: o.store.name,
      sub:
        o.status === "SHIPPED"
          ? `#${o.id.slice(-8).toUpperCase()} · di jalan — report saat sampai`
          : `#${o.id.slice(-8).toUpperCase()} · ${rupiah(o.total)} · siap diantar`,
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
    sub: `${v.n} barang menipis — tawarkan restok`,
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
    by: log.sales?.name ?? "—",
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
      {/* ===== HERO (dark) ===== */}
      <section className="rounded-2xl bg-neutral-900 p-4 text-white sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold">Halo, {user.name.split(" ")[0]}</h1>
            <p className="text-xs text-neutral-400">
              Ringkasan konter & penjualanmu
            </p>
          </div>
          {/* Level 1-5 + grade huruf (S+ … E) — rumus sama dengan yang
              dilihat admin di Performa Sales; hover untuk rincian poin.
              Level 5 (Sales Captain) rahasia: hanya tampil kalau diangkat
              admin, tidak pernah disebut sebagai jenjang berikutnya. */}
          {(myGrade.grade !== null || lvl.level === 5) && (
            <div
              title={gradePartsSummary(myGrade.parts)}
              className="w-full rounded-xl bg-neutral-800 px-3.5 py-2.5 sm:w-auto sm:min-w-64"
            >
              <div className="flex items-center gap-3">
                <LvlIcon className="h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    Lv. {lvl.level} · {lvl.name}
                  </p>
                  <p className="truncate text-[11px] text-neutral-400">
                    {lvl.level === 5
                      ? `Kepala sales wilayah ${user.captainArea}`
                      : myGrade.grade && GRADE_DESC[myGrade.grade]}
                  </p>
                </div>
                {myGrade.grade && (
                  <div className="shrink-0 text-center">
                    <GradeBadge grade={myGrade.grade} size="lg" />
                    <p className="mt-0.5 text-[10px] text-neutral-400">
                      Skor {myGrade.score}/100
                    </p>
                  </div>
                )}
              </div>
              {lvl.next && (
                <p className="mt-2 border-t border-white/10 pt-1.5 text-[10px] text-neutral-500">
                  {lvl.next}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
          {/* Penjualan toko (kiri) */}
          <div className="flex flex-col justify-center rounded-xl bg-neutral-800 p-4 lg:col-span-1">
            <p className="text-xs text-neutral-400">Penjualan Toko</p>
            <p className="mt-1 truncate text-2xl font-bold text-brand">
              {rupiahShort(totalRevenue)}
            </p>
            <p className="text-xs text-neutral-500">dari konter-mu</p>
          </div>

          {/* 4 kartu metrik (putih) */}
          <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-4 text-neutral-900">
              <p className="text-xs text-neutral-500">Konter Saya</p>
              <p className="mt-1 text-2xl font-bold">{konterCount}</p>
              <p className="text-xs text-neutral-400">{visited} dikunjungi</p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-neutral-900">
              <p className="text-xs text-neutral-500">Prospek</p>
              <p className="mt-1 text-2xl font-bold">{totalProspek}</p>
              <p className="text-xs text-neutral-400">{won} closing</p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-neutral-900">
              <p className="text-xs text-neutral-500">Konversi</p>
              <p className="mt-1 text-2xl font-bold">{conversion}%</p>
              <p className="text-xs text-neutral-400">Action + Loyalty</p>
            </div>
            <Link
              href="/konter"
              className="rounded-2xl bg-white p-4 text-neutral-900 transition hover:ring-2 hover:ring-brand"
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
          </div>
        </div>
      </section>

      {/* ===== 4 KPI operasional bulan berjalan (lib/sales-kpi.ts) ===== */}
      <section>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          KPI bulan ini · pembanding bulan lalu
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">Seeding Konter Baru</p>
            <p className="mt-1 text-2xl font-bold">{kpiNow.seeding}</p>
            <p className="text-xs text-neutral-400">
              Bulan lalu {kpiPrev.seeding}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">Konversi Konter Aktif</p>
            <p className="mt-1 text-2xl font-bold">
              {kpiNow.konversi !== null ? `${kpiNow.konversi}%` : "—"}
            </p>
            <p className="text-xs text-neutral-400">
              {kpiNow.aktif} konter reorder · lalu{" "}
              {kpiPrev.konversi !== null ? `${kpiPrev.konversi}%` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">Reorder / Konter Aktif</p>
            <p className="mt-1 text-2xl font-bold">
              {kpiNow.reorder !== null ? (
                <>
                  {kpiNow.reorder}
                  <span className="ml-1 text-sm font-medium text-neutral-400">
                    pcs
                  </span>
                </>
              ) : (
                "—"
              )}
            </p>
            <p className="text-xs text-neutral-400">
              Bulan lalu{" "}
              {kpiPrev.reorder !== null ? `${kpiPrev.reorder} pcs` : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-4">
            <p className="text-xs text-neutral-500">Harga Jual Rata-rata</p>
            <p className="mt-1 truncate text-2xl font-bold">
              {kpiNow.harga !== null ? rupiahShort(kpiNow.harga) : "—"}
            </p>
            <p className="text-xs text-neutral-400">
              per pcs · bulan lalu{" "}
              {kpiPrev.harga !== null ? rupiahShort(kpiPrev.harga) : "—"}
            </p>
          </div>
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
          Antar restok, kunjungan rutin, dan target closing — sekali lihat
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
            Tidak ada rute hari ini — semua beres.
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
                  Sebaran Konter — Karawang
                </div>
                <TrackerMap points={points} storePoints={storePoints} />
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
