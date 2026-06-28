import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { STAGE_LABEL, type Stage } from "@/lib/constants";
import { FunnelBar } from "@/components/FunnelBar";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TrackerMap } from "@/components/TrackerMap";
import type { MapPoint } from "@/components/MapInner";
import { TopProductsInteractive } from "@/components/TopProductsInteractive";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { TargetCard } from "@/components/TargetCard";
import { KonterTerbaru } from "@/components/KonterTerbaru";
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

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const [
    prospects,
    sales,
    recentLogs,
    totalStores,
    tickets,
    requests,
    newStoresThisMonth,
    targetConfig,
  ] = await Promise.all([
    prisma.prospect.findMany({ include: { store: true, product: true } }),
    prisma.sale.findMany({
      include: { store: { include: { sales: true } }, createdBy: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.stageLog.findMany({
      include: {
        prospect: { include: { store: true, product: true } },
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
  ]);

  const monthlyTarget = parseInt(targetConfig?.value ?? "2000000", 10) || 0;
  const monthRevenue = sales
    .filter((s) => new Date(s.createdAt) >= monthStart)
    .reduce((a, s) => a + s.total, 0);

  // Konter terbaru
  const recentStores = await prisma.store.findMany({
    orderBy: { createdAt: "desc" },
    take: 12,
    include: { _count: { select: { transactions: true } } },
  });
  const recentStoreItems = recentStores.map((s) => ({
    id: s.id,
    name: s.name,
    area: s.area,
    isNew: new Date(s.createdAt) >= monthStart,
    isActive: s._count.transactions > 0,
  }));

  // --- Funnel counts ---
  const counts: Record<Stage, number> = {
    AWARENESS: 0,
    INTEREST: 0,
    DESIRE: 0,
    ACTION: 0,
    LOYALTY: 0,
  };
  for (const p of prospects) if (p.stage in counts) counts[p.stage as Stage]++;
  const total = prospects.length;

  // --- Revenue ---
  const totalRevenue = sales.reduce((a, s) => a + s.total, 0);
  const totalUnits = sales.reduce((a, s) => a + s.qty, 0);

  // --- Konter aktif (punya transaksi) ---
  const activeStoresCount = new Set(sales.map((s) => s.storeId)).size;

  // Titik penjualan untuk grafik (bisa difilter rentangnya di client)
  const salesPoints = sales.map((s) => ({
    ts: new Date(s.createdAt).getTime(),
    total: s.total,
  }));

  // Produk terlaris
  const byProduct = new Map<string, { units: number; revenue: number }>();
  for (const s of sales) {
    const r = byProduct.get(s.productName) ?? { units: 0, revenue: 0 };
    r.units += s.qty;
    r.revenue += s.total;
    byProduct.set(s.productName, r);
  }
  const topProducts = [...byProduct.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.units - a.units);

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

      {/* ===== BARIS 2: Aktivitas · Produk · Map ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Aktivitas Terbaru */}
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
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

        {/* Produk Terlaris */}
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Produk Terlaris</h2>
          <div className="flex-1">
            <TopProductsInteractive sales={sales} />
          </div>
        </div>

        {/* Peta */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700">
            <MapPin className="h-4 w-4" />
            Sebaran Konter — Karawang
          </div>
          <TrackerMap points={points} />
        </div>
      </div>

      {/* ===== BARIS 3: Funnel · Grafik · Konter Terbaru (tinggi sama) ===== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Funnel Konter</h2>
            <span className="text-xs text-neutral-400">{total} prospek aktif</span>
          </div>
          <div className="flex flex-1 flex-col justify-center">
            <FunnelBar counts={counts} total={total} />
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Grafik Penjualan</h2>
          <div className="flex-1">
            <SalesTrendChart sales={salesPoints} />
          </div>
        </div>

        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">Konter Terbaru</h2>
            <span className="text-xs text-neutral-400">Area Karawang</span>
          </div>
          <div className="flex-1">
            <KonterTerbaru stores={recentStoreItems} />
          </div>
        </div>
      </div>
    </div>
  );
}
