import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { STAGES, type Stage, type Result } from "@/lib/constants";
import { FunnelBar, type FunnelItem } from "@/components/FunnelBar";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TrackerMap } from "@/components/TrackerMap";
import type { MapPoint } from "@/components/MapInner";
import { TopProductsInteractive } from "@/components/TopProductsInteractive";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { TargetCard } from "@/components/TargetCard";
import { KonterTerbaru } from "@/components/KonterTerbaru";
import { DataTabs } from "@/components/DataTabs";
import { wibMonthStart } from "@/lib/date";
import { MapPin, ArrowRight } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/prospects");
  if (user.role === "GUDANG") redirect("/gudang");

  // Awal bulan di zona WIB (server produksi UTC — tanpa ini "bulan ini"
  // bisa meleset di tanggal awal/akhir bulan).
  const monthStart = wibMonthStart();

  const [
    prospects,
    saleAgg,
    saleMonthAgg,
    activeStoreRows,
    salePointRows,
    recentSales,
    recentLogs,
    totalStores,
    tickets,
    requests,
    newStoresThisMonth,
    targetConfig,
    paidOrders,
  ] = await Promise.all([
    prisma.prospect.findMany({
      // Cukup nama barang — description (daftar HP kompatibel) berat
      include: { store: true, product: { select: { name: true } } },
    }),
    // Total & unit dihitung di database — tabel Sale terus tumbuh, jangan
    // menarik seluruh riwayat transaksi (plus join-nya) tiap render.
    prisma.sale.aggregate({ _sum: { total: true, qty: true } }),
    prisma.sale.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { total: true },
    }),
    prisma.sale.groupBy({ by: ["storeId"] }),
    // Grafik tren + Produk Terlaris butuh riwayat penuh (difilter di client),
    // tapi cukup kolom ringan ini — tanpa join user/harga/diskon.
    prisma.sale.findMany({
      select: {
        createdAt: true,
        total: true,
        qty: true,
        productName: true,
        product: { select: { code: true } },
        store: { select: { area: true } },
      },
    }),
    // Activity feed cukup 40 transaksi terakhir
    prisma.sale.findMany({
      select: {
        id: true,
        storeId: true,
        productName: true,
        qty: true,
        total: true,
        createdAt: true,
        store: { select: { name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    }),
    prisma.stageLog.findMany({
      include: {
        prospect: {
          include: { store: true, product: { select: { name: true } } },
        },
        sales: true,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
    prisma.store.count(),
    prisma.ticket.findMany({
      include: { store: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.request.findMany({
      include: { store: true, createdBy: true },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    prisma.store.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.config.findUnique({ where: { key: "monthly_target" } }),
    // Pendapatan order restok (owner checkout & bayar) — digabung ke Total
    // Penjualan & Target Bulanan bareng transaksi POS. Ambil semua (bukan
    // cuma 20 terbaru di atas, yang buat activity feed) supaya total akurat.
    prisma.request.findMany({
      // Order batal dikecualikan — yang terlanjur dibayar bakal direfund,
      // jangan dihitung omzet.
      where: {
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        items: { some: {} },
      },
      select: { total: true, createdAt: true },
    }),
  ]);

  const monthlyTarget = parseInt(targetConfig?.value ?? "2000000", 10) || 0;
  const monthSalesRevenue = saleMonthAgg._sum.total ?? 0;
  const totalOrderRevenue = paidOrders.reduce((a, o) => a + o.total, 0);
  const monthOrderRevenue = paidOrders
    .filter((o) => new Date(o.createdAt) >= monthStart)
    .reduce((a, o) => a + o.total, 0);
  const monthRevenue = monthSalesRevenue + monthOrderRevenue;

  // Konter terbaru + rumah semua sales (radius kerja 7 km di peta —
  // admin bisa lihat cakupan wilayah tiap sales & celah yang belum tergarap)
  const [recentStores, salesHomeRows] = await Promise.all([
    prisma.store.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      include: { _count: { select: { transactions: true } } },
    }),
    prisma.user.findMany({
      where: { role: "SALES", homeLat: { not: null }, homeLng: { not: null } },
      select: { name: true, homeLat: true, homeLng: true },
    }),
  ]);
  const salesHomes = salesHomeRows.map((s) => ({
    lat: s.homeLat as number,
    lng: s.homeLng as number,
    name: s.name,
  }));
  const recentStoreItems = recentStores.map((s) => ({
    id: s.id,
    name: s.name,
    area: s.area,
    isNew: new Date(s.createdAt) >= monthStart,
    isActive: s._count.transactions > 0,
    createdAt: new Date(s.createdAt).toISOString(),
  }));

  // --- Funnel counts ---
  const counts = Object.fromEntries(
    STAGES.map((s) => [s, 0]),
  ) as Record<Stage, number>;
  for (const p of prospects) if (p.stage in counts) counts[p.stage as Stage]++;
  const total = prospects.length;

  // Detail per tahap — daftar konter/prospek buat expand di FunnelBar.
  // Hasil terakhir diambil dari recentLogs (sudah urut desc), default NEUTRAL.
  const funnelItems = Object.fromEntries(
    STAGES.map((s) => [s, [] as FunnelItem[]]),
  ) as Record<Stage, FunnelItem[]>;
  for (const p of prospects) {
    if (!(p.stage in funnelItems)) continue;
    const last = recentLogs.find((l) => l.prospectId === p.id);
    funnelItems[p.stage as Stage].push({
      id: p.id,
      storeId: p.storeId,
      product: p.product.name,
      store: p.store.name,
      area: p.store.area ?? "—",
      result: (last?.result ?? "NEUTRAL") as Result,
    });
  }

  // --- Revenue --- Total Penjualan = POS (jual ke end customer) + Order
  // restok yang sudah dibayar owner (dua-duanya pendapatan yang masuk).
  const totalSalesRevenue = saleAgg._sum.total ?? 0;
  const totalRevenue = totalSalesRevenue + totalOrderRevenue;
  const totalUnits = saleAgg._sum.qty ?? 0;

  // --- Konter aktif (punya transaksi) ---
  const activeStoresCount = activeStoreRows.length;

  // Titik grafik "Penjualan Barang" di dashboard admin = penjualan barang
  // ADMIN ke konter, yaitu order restok yang sudah dibayar (bukan POS —
  // POS itu penjualan toko ke end customer, dipakai untuk Produk Terlaris
  // & data pasar). Dibucket per rentang di client (SalesTrendChart).
  const salesPoints = paidOrders.map((o) => ({
    ts: new Date(o.createdAt).getTime(),
    total: o.total,
  }));

  // --- Map points ---
  const points: MapPoint[] = prospects
    .filter((p) => p.store.lat != null && p.store.lng != null)
    .map((p) => {
      const last = recentLogs.find((l) => l.prospectId === p.id);
      return {
        id: p.id,
        storeId: p.storeId,
        product: p.product.name,
        store: p.store.name,
        area: p.store.area,
        stage: p.stage,
        result: last?.result ?? "NEUTRAL",
        lat: p.store.lat as number,
        lng: p.store.lng as number,
      };
    });

  // --- Activities: funnel + penjualan, digabung & diurut ---
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
    href: `/prospects/${log.prospectId}`,
    title: `${log.prospect.product.name} @ ${log.prospect.store.name}`,
    subtitle: log.note,
    by: log.sales?.name ?? "—",
    date: fmtDate(log.createdAt),
    stage: log.stage,
    result: log.result,
  }));

  const saleActs = recentSales.map((s) => ({
    id: `sale-${s.id}`,
    type: "SALE" as const,
    ts: new Date(s.createdAt).getTime(),
    href: `/konter/${s.storeId}`,
    title: `${s.productName} @ ${s.store.name}`,
    subtitle: `Terjual ${s.qty} unit · ${rupiah(s.total)}`,
    by: s.createdBy?.name ?? "Owner",
    date: fmtDate(s.createdAt),
  }));

  const ticketActs = tickets.map((t) => ({
    id: `ticket-${t.id}`,
    type: "PROBLEM" as const,
    ts: new Date(t.createdAt).getTime(),
    href: `/konter/${t.storeId}`,
    title: `Keluhan @ ${t.store.name}`,
    subtitle: t.subject,
    by: t.createdBy?.name ?? "Owner",
    date: fmtDate(t.createdAt),
  }));

  const requestActs = requests.map((r) => ({
    id: `request-${r.id}`,
    type: "REQUEST" as const,
    ts: new Date(r.createdAt).getTime(),
    href: `/konter/${r.storeId}`,
    title: `Request @ ${r.store.name}`,
    subtitle: r.subject,
    by: r.createdBy?.name ?? "System",
    date: fmtDate(r.createdAt),
  }));

  const activities = [...funnelActs, ...saleActs, ...ticketActs, ...requestActs]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 80);

  return (
    <div className="space-y-6">
      {/* ===== HERO (dark) ===== */}
      <section className="rounded-2xl bg-neutral-900 p-4 text-white sm:p-5">
        <h1 className="text-lg font-bold">Sales Distribution</h1>
        <p className="text-xs text-neutral-400">
          Ringkasan penjualan & funnel seluruh konter
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-5">
          {/* Total penjualan (kiri) */}
          <div className="flex flex-col justify-center rounded-xl bg-neutral-800 p-4 lg:col-span-1">
            <p className="text-xs text-neutral-400">Total Penjualan</p>
            <p className="mt-1 truncate text-2xl font-bold text-brand">
              {rupiah(totalRevenue)}
            </p>
            <p className="text-xs text-neutral-500">{totalUnits} unit terjual</p>
          </div>

          {/* 4 kartu metrik (putih) */}
          <div className="grid grid-cols-2 gap-3 lg:col-span-4 lg:grid-cols-4">
            <div className="rounded-2xl bg-white p-4 text-neutral-900">
              <p className="text-xs text-neutral-500">Konter Aktif</p>
              <p className="mt-1 text-2xl font-bold">{activeStoresCount}</p>
              {newStoresThisMonth > 0 ? (
                <span className="mt-1 inline-block rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-neutral-900">
                  +{newStoresThisMonth} baru
                </span>
              ) : (
                <p className="text-xs text-neutral-400">dari {totalStores} konter</p>
              )}
            </div>
            <div className="rounded-2xl bg-white p-4 text-neutral-900">
              <p className="text-xs text-neutral-500">Konter Baru</p>
              <p className="mt-1 text-2xl font-bold">{newStoresThisMonth}</p>
              <p className="text-xs text-neutral-400">Bulan ini · Karawang</p>
            </div>
            <div className="rounded-2xl bg-white p-4 text-neutral-900">
              <p className="text-xs text-neutral-500">Unit Terjual</p>
              <p className="mt-1 text-2xl font-bold">{totalUnits}</p>
              <p className="text-xs text-neutral-400">Total terjual</p>
            </div>
            <TargetCard current={monthRevenue} target={monthlyTarget} />
          </div>
        </div>
      </section>

      {/* Di HP panel-panel dipisah 3 tab; desktop tetap 2 baris × 3 kolom.
          Urutan section = urutan desktop: Aktivitas · Produk · Peta lalu
          Funnel · Grafik · Konter. */}
      <DataTabs
        gridClassName="lg:grid-cols-3"
        tabs={[
          { key: "statistik", label: "Statistik" },
          { key: "aktivitas", label: "Aktivitas" },
          { key: "peta", label: "Peta & Konter" },
        ]}
        sections={[
          {
            tab: "aktivitas",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Aktivitas Terbaru</h2>
                  <Link
                    href="/prospects"
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:underline"
                  >
                    Lihat semua
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <ActivityFeed activities={activities} />
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
                  <TopProductsInteractive sales={salePointRows} />
                </div>
              </div>
            ),
          },
          {
            tab: "peta",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700">
                  <MapPin className="h-4 w-4" />
                  Sebaran Konter — Karawang
                </div>
                <TrackerMap points={points} homePoints={salesHomes} />
              </div>
            ),
          },
          {
            tab: "statistik",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Funnel Konter</h2>
                  <Link
                    href="/funnel"
                    className="flex items-center gap-1 text-sm text-neutral-500 hover:underline"
                  >
                    Detail
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <div className="flex flex-1 flex-col justify-center">
                  <FunnelBar counts={counts} total={total} items={funnelItems} />
                </div>
              </div>
            ),
          },
          {
            tab: "statistik",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <h2 className="mb-1 font-semibold">Penjualan Barang</h2>
                <p className="mb-3 text-xs text-neutral-400">
                  Order restok konter yang sudah dibayar
                </p>
                <div className="flex-1">
                  <SalesTrendChart sales={salesPoints} />
                </div>
              </div>
            ),
          },
          {
            tab: "peta",
            className: "h-full",
            node: (
              <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="font-semibold">Konter Terbaru</h2>
                  <span className="text-xs text-neutral-400">Area Karawang</span>
                </div>
                <div className="flex-1">
                  <KonterTerbaru stores={recentStoreItems} />
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
