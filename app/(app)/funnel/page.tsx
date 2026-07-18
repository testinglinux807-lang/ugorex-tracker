import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FunnelBar } from "@/components/FunnelBar";
import { FunnelViews } from "@/components/FunnelViews";
import type { StoreFunnel } from "@/components/FunnelAnalysis";
import type { SalesEval } from "@/components/SalesEvaluation";
import { STAGES, type Stage, type Result } from "@/lib/constants";
import { ArrowLeft } from "lucide-react";

// Konter dianggap "terbengkalai" kalau tak ada aktivitas funnel > 30 hari.
const NEGLECT_DAYS = 30;

export default async function FunnelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  const [prospects, revenueRows] = await Promise.all([
    prisma.prospect.findMany({
      include: {
        store: { include: { sales: true } },
        logs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // Omzet per konter dihitung di database, bukan menarik semua transaksi
    prisma.sale.groupBy({ by: ["storeId"], _sum: { total: true } }),
  ]);

  const stageIdx = (s: string) => STAGES.indexOf(s as Stage);

  // Omzet per konter (dari transaksi POS)
  const revenueByStore = new Map(
    revenueRows.map((r) => [r.storeId, r._sum.total ?? 0]),
  );

  // --- Ringkasan funnel keseluruhan (per prospek) ---
  const counts = Object.fromEntries(
    STAGES.map((s) => [s, 0]),
  ) as Record<Stage, number>;
  for (const p of prospects)
    if (p.stage in counts) counts[p.stage as Stage]++;
  const total = prospects.length;

  // --- Agregasi per konter ---
  type Acc = {
    store: (typeof prospects)[number]["store"];
    stageCounts: Record<Stage, number>;
    totalProspek: number;
    furthestIdx: number;
    furthest: Stage;
    lastResult: Result;
    lastTs: number; // aktivitas terbaru (ms), 0 kalau belum ada
  };
  const byStore = new Map<string, Acc>();

  for (const p of prospects) {
    let acc = byStore.get(p.storeId);
    if (!acc) {
      acc = {
        store: p.store,
        stageCounts: Object.fromEntries(
          STAGES.map((s) => [s, 0]),
        ) as Record<Stage, number>,
        totalProspek: 0,
        furthestIdx: -1,
        furthest: "AWARENESS",
        lastResult: "NEUTRAL",
        lastTs: 0,
      };
      byStore.set(p.storeId, acc);
    }

    acc.totalProspek++;
    if (p.stage in acc.stageCounts) acc.stageCounts[p.stage as Stage]++;

    const idx = stageIdx(p.stage);
    if (idx > acc.furthestIdx) {
      acc.furthestIdx = idx;
      acc.furthest = (STAGES[idx] ?? "AWARENESS") as Stage;
    }

    const last = p.logs[0];
    const ts = last
      ? new Date(last.createdAt).getTime()
      : new Date(p.updatedAt).getTime();
    if (ts > acc.lastTs) {
      acc.lastTs = ts;
      acc.lastResult = (last?.result ?? "NEUTRAL") as Result;
    }
  }

  const stores: StoreFunnel[] = Array.from(byStore.values())
    .map((a) => ({
      storeId: a.store.id,
      name: a.store.name,
      area: a.store.area,
      salesId: a.store.salesId,
      sales: a.store.sales?.name ?? null,
      totalProspek: a.totalProspek,
      stageCounts: a.stageCounts,
      furthest: a.furthest,
      lastResult: a.lastResult,
      lastActivity: a.lastTs ? new Date(a.lastTs).toISOString() : null,
      revenue: revenueByStore.get(a.store.id) ?? 0,
    }))
    .sort(
      (x, y) =>
        STAGES.indexOf(y.furthest) - STAGES.indexOf(x.furthest) ||
        (y.lastActivity ?? "").localeCompare(x.lastActivity ?? ""),
    );

  const loyalIdx = STAGES.indexOf("LOYALTY");
  const isLoyal = (s: StoreFunnel | { furthest: Stage }) =>
    STAGES.indexOf(s.furthest) >= loyalIdx;
  const loyalCount = stores.filter(isLoyal).length;
  const conversionCount = stores.filter(
    (s) => s.furthest === "CONVERSION",
  ).length;

  // --- Agregasi per sales (evaluasi) ---
  const nowMs = new Date().getTime();
  const neglectCut = nowMs - NEGLECT_DAYS * 86_400_000;
  const daysSince = (iso: string | null) =>
    iso ? Math.floor((nowMs - new Date(iso).getTime()) / 86_400_000) : null;
  const isNeglected = (iso: string | null) =>
    !iso || new Date(iso).getTime() < neglectCut;

  const bySales = new Map<string, StoreFunnel[]>();
  for (const st of stores) {
    const key = st.salesId ?? "__none__";
    const arr = bySales.get(key) ?? [];
    arr.push(st);
    bySales.set(key, arr);
  }

  const salesRows: SalesEval[] = Array.from(bySales.entries())
    .map(([key, konter]) => {
      const name =
        key === "__none__" ? "Tanpa sales" : (konter[0].sales ?? "Tanpa sales");
      const revenue = konter.reduce((a, k) => a + k.revenue, 0);
      const best = [...konter].sort((a, b) => b.revenue - a.revenue)[0];
      // Paling terbengkalai = aktivitas paling lama / belum pernah
      const worst = [...konter].sort(
        (a, b) =>
          (a.lastActivity ?? "").localeCompare(b.lastActivity ?? ""),
      )[0];
      return {
        salesId: key === "__none__" ? null : key,
        name,
        konterCount: konter.length,
        revenue,
        loyalCount: konter.filter(isLoyal).length,
        conversionCount: konter.filter((k) => k.furthest === "CONVERSION")
          .length,
        terbengkalaiCount: konter.filter((k) => isNeglected(k.lastActivity))
          .length,
        best:
          best && best.revenue > 0
            ? { storeId: best.storeId, name: best.name, revenue: best.revenue }
            : null,
        worst:
          worst && isNeglected(worst.lastActivity)
            ? {
                storeId: worst.storeId,
                name: worst.name,
                days: daysSince(worst.lastActivity),
              }
            : null,
      };
    })
    .sort(
      (a, b) =>
        b.revenue - a.revenue ||
        b.loyalCount - a.loyalCount ||
        b.konterCount - a.konterCount,
    );

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <h1 className="text-2xl font-bold">Analisis Funnel Konter</h1>
        <p className="text-sm text-neutral-500">
          {stores.length} konter · {total} produk dilacak
        </p>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-semibold">Sebaran Tahap</h2>
          <FunnelBar counts={counts} total={total} />
        </section>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-1">
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-500">Konter Loyal</p>
            <p className="mt-1 text-2xl font-bold">{loyalCount}</p>
            <p className="text-xs text-neutral-400">repeat order</p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-xs text-neutral-500">Sudah Conversion</p>
            <p className="mt-1 text-2xl font-bold">{conversionCount}</p>
            <p className="text-xs text-neutral-400">mulai jualan</p>
          </div>
        </div>
      </div>

      {/* Per Konter / Per Sales */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <FunnelViews stores={stores} salesRows={salesRows} />
      </section>
    </div>
  );
}
