import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rupiahShort } from "@/lib/format";
import { STAGES, type Stage } from "@/lib/constants";
import { Users, Trophy, ArrowUpRight } from "lucide-react";

// Konter dianggap "terbengkalai" kalau > 30 hari tak ada aktivitas funnel.
const NEGLECT_DAYS = 30;

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-1.5 text-center">
      <p
        className={`text-sm font-bold ${warn ? "text-amber-600" : "text-neutral-800"}`}
      >
        {value}
      </p>
      <p className="text-[10px] text-neutral-400">{label}</p>
    </div>
  );
}

export default async function SalesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  const [salesUsers, prospects, saleRows, stores, tasks] = await Promise.all([
    prisma.user.findMany({ where: { role: "SALES" }, orderBy: { name: "asc" } }),
    prisma.prospect.findMany({
      include: { logs: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.sale.findMany({ select: { storeId: true, total: true } }),
    prisma.store.findMany({
      select: { id: true, salesId: true, createdAt: true },
    }),
    prisma.task.findMany({ select: { assignedToId: true, status: true } }),
  ]);

  // Omzet per konter
  const revenueByStore = new Map<string, number>();
  for (const s of saleRows)
    revenueByStore.set(
      s.storeId,
      (revenueByStore.get(s.storeId) ?? 0) + s.total,
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

  // Tugas per sales
  const taskStat = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    const s = taskStat.get(t.assignedToId) ?? { total: 0, done: 0 };
    s.total++;
    if (t.status === "DONE") s.done++;
    taskStat.set(t.assignedToId, s);
  }

  const rows = salesUsers
    .map((u) => {
      const myStores = stores.filter((s) => s.salesId === u.id);
      let revenue = 0;
      let loyal = 0;
      let terbengkalai = 0;
      for (const s of myStores) {
        revenue += revenueByStore.get(s.id) ?? 0;
        const agg = storeAgg.get(s.id);
        if (agg && agg.furthestIdx >= loyalIdx) loyal++;
        // aktivitas terakhir; konter tanpa prospek pakai tanggal dibuatnya
        const lastTs = agg?.lastTs || new Date(s.createdAt).getTime();
        if (lastTs < neglectCut) terbengkalai++;
      }
      const ts = taskStat.get(u.id) ?? { total: 0, done: 0 };
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
          {salesUsers.length} sales · diurut dari omzet · klik kartu untuk detail
        </p>
      </div>

      {salesUsers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-10 text-center text-sm text-neutral-500">
          Belum ada akun sales. Tambah di menu Data → Akun Sales.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((r, i) => (
            <Link
              key={r.id}
              href={`/sales/${r.id}`}
              className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-400"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {i === 0 && (
                      <Trophy className="h-4 w-4 shrink-0 text-brand-dark" />
                    )}
                    <span className="truncate">{r.name}</span>
                  </p>
                  <p className="text-xs text-neutral-400">{r.phone}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-xs font-medium text-neutral-400">
                    #{i + 1}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-600" />
                </span>
              </div>

              <div className="mt-3 rounded-xl bg-neutral-900 p-3 text-white">
                <p className="text-xs text-neutral-400">Omzet</p>
                <p className="text-xl font-bold text-brand">
                  {r.revenue > 0 ? rupiahShort(r.revenue) : "—"}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <Stat label="Konter" value={r.konter} />
                <Stat label="Loyal" value={r.loyal} />
                <Stat
                  label="Terbengkalai"
                  value={r.terbengkalai}
                  warn={r.terbengkalai > 0}
                />
                <Stat label="Tugas" value={`${r.taskDone}/${r.taskTotal}`} />
              </div>
            </Link>
          ))}
        </div>
      )}

      <p className="text-xs text-neutral-400">
        Loyal = konter yang mencapai tahap Loyalty · Terbengkalai = konter &gt;{" "}
        {NEGLECT_DAYS} hari tanpa aktivitas · Tugas = selesai/total tugas dari
        admin.
      </p>
    </div>
  );
}
