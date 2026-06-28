import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FunnelBar } from "@/components/FunnelBar";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { TopProductsInteractive } from "@/components/TopProductsInteractive";
import { ActivityFeed } from "@/components/ActivityFeed";
import { TrackerMap } from "@/components/TrackerMap";
import type { MapPoint } from "@/components/MapInner";
import { type Stage } from "@/lib/constants";
import { rupiahShort } from "@/lib/format";
import { MapPin, ArrowRight } from "lucide-react";

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

  const [stores, prospects, sales, recentLogs] = await Promise.all([
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
        product: p.product.name,
        remaining: p.stock - sold,
        stock: p.stock,
      };
    })
    .filter((x) => x.stock > 0 && x.remaining > 0 && x.remaining <= 10)
    .sort((a, b) => a.remaining - b.remaining);
  const lowStock = lowStockItems.length;
  const lowStockStores = new Set(lowStockItems.map((x) => x.storeId)).size;

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
        <h1 className="text-lg font-bold">Halo, {user.name.split(" ")[0]}</h1>
        <p className="text-xs text-neutral-400">Ringkasan konter & penjualanmu</p>

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

      {/* Funnel · Grafik · Produk */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
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
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Grafik Penjualan</h2>
          <div className="flex-1">
            <SalesTrendChart sales={salesPoints} />
          </div>
        </div>
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Produk Terlaris</h2>
          <div className="flex-1">
            <TopProductsInteractive sales={sales} />
          </div>
        </div>
      </div>

      {/* Peta + Aktivitas */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col lg:col-span-2">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-700">
            <MapPin className="h-4 w-4" />
            Sebaran Konter — Karawang
          </div>
          <TrackerMap points={points} />
        </div>
        <div className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
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
      </div>
    </div>
  );
}
