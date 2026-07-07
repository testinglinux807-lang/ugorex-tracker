import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StageBadge } from "@/components/Badge";
import { Paginated } from "@/components/Paginated";
import { rupiahShort } from "@/lib/format";
import { STAGES, type Stage } from "@/lib/constants";
import {
  ArrowLeft,
  MapPin,
  Phone,
  Store as StoreIcon,
  ClipboardList,
  AlertTriangle,
} from "lucide-react";

const NEGLECT_DAYS = 30;

const fmtDate = (d: Date | string) =>
  new Date(d).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

function Kpi({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4">
      <p className="text-xs text-neutral-500">{label}</p>
      <p
        className={`mt-1 truncate text-xl font-bold lg:text-2xl ${
          accent ? "text-brand-dark" : warn ? "text-amber-600" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

export default async function SalesDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  const sales = await prisma.user.findUnique({ where: { id } });
  if (!sales || sales.role !== "SALES") notFound();

  const [stores, saleRows, tasks] = await Promise.all([
    prisma.store.findMany({
      where: { salesId: id },
      include: {
        prospects: {
          include: { logs: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.sale.findMany({
      where: { store: { salesId: id } },
      select: { storeId: true, total: true },
    }),
    prisma.task.findMany({
      where: { assignedToId: id },
      include: { store: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
  ]);

  const revenueByStore = new Map<string, number>();
  for (const s of saleRows)
    revenueByStore.set(
      s.storeId,
      (revenueByStore.get(s.storeId) ?? 0) + s.total,
    );

  const nowMs = new Date().getTime();
  const neglectCut = nowMs - NEGLECT_DAYS * 86_400_000;

  const konter = stores
    .map((st) => {
      let furthestIdx = -1;
      let lastTs = 0;
      for (const p of st.prospects) {
        const idx = STAGES.indexOf(p.stage as Stage);
        if (idx > furthestIdx) furthestIdx = idx;
        const last = p.logs[0];
        const ts = last
          ? new Date(last.createdAt).getTime()
          : new Date(p.updatedAt).getTime();
        if (ts > lastTs) lastTs = ts;
      }
      const effLast = lastTs || new Date(st.createdAt).getTime();
      return {
        id: st.id,
        name: st.name,
        area: st.area,
        furthest: furthestIdx >= 0 ? (STAGES[furthestIdx] as Stage) : null,
        revenue: revenueByStore.get(st.id) ?? 0,
        prospek: st.prospects.length,
        lastTs: effLast,
        neglected: effLast < neglectCut,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  const totalRevenue = konter.reduce((a, s) => a + s.revenue, 0);
  const loyal = konter.filter((s) => s.furthest === "LOYALTY").length;
  const terbengkalai = konter.filter((s) => s.neglected).length;
  const taskDone = tasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-6">
      <Link
        href="/sales"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Performa Sales
      </Link>

      {/* Header */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-bold">{sales.name}</h1>
        <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
          <Phone className="h-3.5 w-3.5 shrink-0" />
          {sales.phone}
        </p>
      </div>

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Omzet" value={rupiahShort(totalRevenue)} accent />
        <Kpi label="Konter" value={konter.length} />
        <Kpi label="Konter Loyal" value={loyal} />
        <Kpi label="Terbengkalai" value={terbengkalai} warn={terbengkalai > 0} />
        <Kpi label="Tugas" value={`${taskDone}/${tasks.length}`} />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        {/* Daftar konter */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <StoreIcon className="h-4 w-4 text-neutral-500" />
            Konter ({konter.length})
          </h2>
          <Paginated
            perPage={6}
            className="space-y-2"
            empty={
              <p className="text-sm text-neutral-400">
                Belum ada konter yang dipegang.
              </p>
            }
            items={konter.map((k) => (
              <Link
                key={k.id}
                href={`/konter/${k.id}`}
                className="group block rounded-lg border border-neutral-200 p-3 hover:border-neutral-400"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{k.name}</p>
                    <p className="flex items-center gap-1 truncate text-xs text-neutral-400">
                      <MapPin className="h-3 w-3 shrink-0" />
                      {k.area ?? "—"}
                    </p>
                  </div>
                  {k.furthest ? (
                    <StageBadge stage={k.furthest} />
                  ) : (
                    <span className="shrink-0 text-xs text-neutral-400">
                      belum digarap
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-neutral-400">
                  <span>
                    <span className="font-semibold text-neutral-700">
                      {k.revenue > 0 ? rupiahShort(k.revenue) : "belum ada omzet"}
                    </span>{" "}
                    · {k.prospek} produk
                  </span>
                  {k.neglected ? (
                    <span className="flex items-center gap-1 font-medium text-amber-600">
                      <AlertTriangle className="h-3 w-3" />
                      terbengkalai
                    </span>
                  ) : (
                    <span>aktif {fmtDate(new Date(k.lastTs))}</span>
                  )}
                </div>
              </Link>
            ))}
          />
        </section>

        {/* Tugas dari admin */}
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 flex items-center gap-2 font-semibold">
            <ClipboardList className="h-4 w-4 text-neutral-500" />
            Tugas dari Admin ({taskDone}/{tasks.length})
          </h2>
          <Paginated
            perPage={6}
            className="space-y-2"
            empty={
              <p className="text-sm text-neutral-400">
                Belum ada tugas yang diberikan.
              </p>
            }
            items={tasks.map((t) => {
              const done = t.status === "DONE";
              const overdue =
                !done &&
                t.dueDate != null &&
                new Date(t.dueDate).getTime() < nowMs;
              return (
                <div
                  key={t.id}
                  className="rounded-lg border border-neutral-200 p-3"
                >
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    {t.priority === "HIGH" && (
                      <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                        Penting
                      </span>
                    )}
                    <span className={done ? "text-neutral-400 line-through" : ""}>
                      {t.title}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400">
                    {done ? "Selesai" : "Belum selesai"}
                    {t.store ? ` · ${t.store.name}` : ""}
                    {t.dueDate ? (
                      <span className={overdue ? "font-semibold text-red-600" : ""}>
                        {" "}
                        · tenggat {fmtDate(t.dueDate)}
                      </span>
                    ) : (
                      ""
                    )}
                  </p>
                </div>
              );
            })}
          />
        </section>
      </div>
    </div>
  );
}
