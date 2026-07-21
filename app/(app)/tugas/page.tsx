import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  markOrderReady,
  pickupOrder,
  updateRequestStatus,
} from "@/app/actions/requests";
import { setTaskDone, deleteTask } from "@/app/actions/tasks";
import { Paginated } from "@/components/Paginated";
import { SubmitButton } from "@/components/SubmitButton";
import { DeliveryReportForm } from "@/components/DeliveryReportForm";
import { TaskAssignForm } from "@/components/TaskAssignForm";
import { TugasTabs } from "@/components/TugasTabs";
import { GradeBadge, LevelBadge } from "@/components/Badge";
import { taskGrade } from "@/lib/task-grade";
import { computeLevel } from "@/lib/sales-kpi-grade";
import {
  computeSalesKpiValues,
  activeDaysBySalesFrom,
} from "@/lib/sales-kpi-values";
import { getScoreTargets } from "@/lib/kpi-config";
import { getPriorScoresBatch, wibPeriod } from "@/lib/sales-score-history";
import { wibMonthStart } from "@/lib/date";
import { STAGES, type Stage } from "@/lib/constants";
import { waLink } from "@/lib/wa";
import {
  ArrowRight,
  Award,
  Truck,
  Package,
  PackageCheck,
  CreditCard,
  MessageCircle,
  CheckCircle2,
  Store,
  ClipboardList,
  Trash2,
  type LucideIcon,
} from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

// Konter dianggap "terbengkalai" kalau > 30 hari tak ada aktivitas funnel
// (sama dengan halaman Performa Sales).
const NEGLECT_DAYS = 30;

// Header sub-kelompok di dalam tab (state alur kerja)
function StateHeader({
  icon: Icon,
  title,
  n,
}: {
  icon: LucideIcon;
  title: string;
  n: number;
}) {
  return (
    <p className="mb-1 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 first:mt-0">
      <Icon className="h-3.5 w-3.5" />
      {title} ({n})
    </p>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-10 text-center">
      <CheckCircle2 className="h-7 w-7 text-brand-dark" />
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

// To-do list kerjaan sales (admin: semua toko) gaya inbox: tab per jenis
// kerjaan + badge angka, dan tombol aksi langsung di tiap kartu sesuai
// state-nya — menandai dikirim/selesai otomatis memindahkan item ke
// state berikutnya tanpa pindah halaman.
export default async function TugasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  const isAdmin = user.role === "ADMIN";
  const storeScope = isAdmin ? {} : { salesId: user.id };

  const [orders, freeRequests, tickets, stores] = await Promise.all([
    prisma.request.findMany({
      where: {
        items: { some: {} },
        status: { notIn: ["COMPLETED", "CANCELLED"] },
        store: storeScope,
      },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.request.findMany({
      where: { items: { none: {} }, status: "PENDING", store: storeScope },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ticket.findMany({
      where: { status: { not: "CLOSED" }, store: storeScope },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.store.findMany({
      where: storeScope,
      include: { _count: { select: { prospects: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Tugas manual dari admin: admin lihat semua, sales lihat miliknya.
  // gradeStores/prospects/saleTotals/ratingAgg = bahan grade huruf & level
  // (lib/sales-grade.ts) — semua konter & omzet semua waktu tetap diambil
  // penuh karena pembandingnya omzet terbaik satu tim.
  const [tasks, salesList, gradeStores, prospects, saleTotals, ratingAgg] =
    await Promise.all([
      prisma.task.findMany({
        where: isAdmin ? {} : { assignedToId: user.id },
        include: { assignedTo: true, store: true },
        // status desc → "PENDING" (belum selesai) di atas, "DONE" ke bawah
        orderBy: [{ status: "desc" }, { createdAt: "desc" }],
      }),
      isAdmin
        ? prisma.user.findMany({
            where: { role: "SALES" },
            select: { id: true, name: true, captainArea: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve(
            [] as { id: string; name: string; captainArea: string | null }[],
          ),
      prisma.store.findMany({
        select: { id: true, salesId: true, createdAt: true },
      }),
      prisma.prospect.findMany({
        where: { store: storeScope },
        select: {
          storeId: true,
          stage: true,
          updatedAt: true,
          logs: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      }),
      prisma.sale.groupBy({ by: ["storeId"], _sum: { total: true } }),
      prisma.salesRating.groupBy({ by: ["salesId"], _avg: { stars: true } }),
    ]);
  const pendingTasks = tasks.filter((t) => t.status !== "DONE");

  // Alur baru: PENDING lunas = packing gudang (aksi ADMIN "Siap Dipickup"),
  // READY = menunggu kurir (aksi SALES "Pickup Barang"), SHIPPED = di jalan.
  const packing = orders.filter(
    (o) => o.status === "PENDING" && o.paymentStatus === "PAID",
  );
  const pickup = orders.filter((o) => o.status === "READY");
  const diJalan = orders.filter((o) => o.status === "SHIPPED");
  const belumBayar = orders.filter(
    (o) => o.status === "PENDING" && o.paymentStatus !== "PAID",
  );
  const unvisited = stores.filter((s) => s._count.prospects === 0);

  const orderCount =
    packing.length + pickup.length + diJalan.length + belumBayar.length;
  const taskCount = pendingTasks.length;
  const totalTugas =
    orderCount +
    freeRequests.length +
    tickets.length +
    unvisited.length +
    (isAdmin ? 0 : taskCount);

  const now = new Date();
  const isOverdue = (t: (typeof tasks)[number]) =>
    t.status !== "DONE" && t.dueDate != null && new Date(t.dueDate) < now;

  // Baris tugas buat sales (aksi: tandai selesai / buka lagi)
  const salesTaskRow = (t: (typeof tasks)[number]) => {
    const done = t.status === "DONE";
    return (
      <div
        key={t.id}
        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
      >
        <div className="min-w-0 flex-1">
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
          {t.note && (
            <p className="truncate text-xs text-neutral-500">{t.note}</p>
          )}
          <p className="text-xs text-neutral-400">
            {t.store && (
              <Link
                href={`/konter/${t.storeId}`}
                className="hover:underline"
              >
                {t.store.name}
              </Link>
            )}
            {t.store && t.dueDate ? " · " : ""}
            {t.dueDate && (
              <span className={isOverdue(t) ? "font-semibold text-red-600" : ""}>
                Tenggat {fmtDate(t.dueDate)}
              </span>
            )}
          </p>
        </div>
        <form action={setTaskDone.bind(null, t.id, !done)}>
          <SubmitButton
            pendingText="Memproses…"
            className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 ${
              done
                ? "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                : "bg-neutral-900 text-white hover:bg-neutral-800"
            }`}
          >
            {done ? "Buka lagi" : "Selesai"}
          </SubmitButton>
        </form>
      </div>
    );
  };

  // Baris tugas buat admin (info penerima + hapus)
  const adminTaskRow = (t: (typeof tasks)[number]) => {
    const done = t.status === "DONE";
    return (
      <div
        key={t.id}
        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
      >
        <div className="min-w-0 flex-1">
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
          <p className="truncate text-xs text-neutral-400">
            {t.assignedTo.name}
            {t.store ? ` · ${t.store.name}` : ""}
            {t.dueDate ? ` · tenggat ${fmtDate(t.dueDate)}` : ""}
            {` · ${done ? "selesai" : "belum"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* Ingatkan sales ngerjain tugasnya via WhatsApp (chat ke no HP-nya) */}
          {!done &&
            (() => {
              const wa = waLink(
                t.assignedTo.phone,
                [
                  `Halo ${t.assignedTo.name}, reminder tugas dari admin:`,
                  `"${t.title}"`,
                  ...(t.dueDate ? [`Tenggat: ${fmtDate(t.dueDate)}`] : []),
                  ``,
                  `Mohon dikerjakan ya - cek di menu Tugas → Dari Admin.`,
                ].join("\n"),
              );
              return wa ? (
                <a
                  href={wa}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={`Ingatkan ${t.assignedTo.name} via WhatsApp`}
                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Ingatkan
                </a>
              ) : null;
            })()}
          <form action={deleteTask.bind(null, t.id)}>
            <SubmitButton
              pendingText="Menghapus…"
              title="Hapus tugas"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </SubmitButton>
          </form>
        </div>
      </div>
    );
  };

  const orderInfo = (o: (typeof orders)[number]) => (
    <Link href={`/order?focus=${o.id}`} className="min-w-0 flex-1 hover:underline">
      <span className="block truncate text-sm font-medium">{o.store.name}</span>
      <span className="block truncate text-xs text-neutral-400">
        #{o.id.slice(-8).toUpperCase()} · {rupiah(o.total)} · {fmtDate(o.createdAt)}
      </span>
    </Link>
  );

  // Grade huruf & level per sales — rumus yang sama dengan halaman
  // Performa Sales (lib/sales-grade.ts): omzet vs terbaik tim, konter
  // loyal, keaktifan, KPI tugas, dan rating owner.
  const loyalIdx = STAGES.indexOf("LOYALTY");
  const neglectCut = now.getTime() - NEGLECT_DAYS * 86_400_000;
  const storeAgg = new Map<string, { furthestIdx: number; lastTs: number }>();
  for (const p of prospects) {
    const a = storeAgg.get(p.storeId) ?? { furthestIdx: -1, lastTs: 0 };
    const idx = STAGES.indexOf(p.stage as Stage);
    if (idx > a.furthestIdx) a.furthestIdx = idx;
    const ts = p.logs[0]
      ? new Date(p.logs[0].createdAt).getTime()
      : new Date(p.updatedAt).getTime();
    if (ts > a.lastTs) a.lastTs = ts;
    storeAgg.set(p.storeId, a);
  }

  const allTimeByStore = new Map(
    saleTotals.map((t) => [t.storeId, t._sum.total ?? 0]),
  );
  const allTimeBySales = new Map<string, number>();
  for (const s of gradeStores) {
    if (!s.salesId) continue;
    allTimeBySales.set(
      s.salesId,
      (allTimeBySales.get(s.salesId) ?? 0) + (allTimeByStore.get(s.id) ?? 0),
    );
  }
  const maxRevenue = Math.max(0, ...allTimeBySales.values());
  const ratingBySales = new Map(
    ratingAgg.map((r) => [r.salesId, Math.round((r._avg.stars ?? 0) * 10) / 10]),
  );

  // ===== Level MILESTONE per level (SAMA dgn beranda/leaderboard) =====
  const monthStart = wibMonthStart();
  const scoreTargets = await getScoreTargets();
  const period = wibPeriod();
  const priorScores = await getPriorScoresBatch(
    salesList.map((s) => s.id),
    period,
  );
  const [kpiOrdersMonth, kpiLogsMonth] = await Promise.all([
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        createdAt: { gte: monthStart },
      },
      select: { storeId: true, total: true },
    }),
    prisma.stageLog.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { salesId: true, createdAt: true },
    }),
  ]);
  const activeDaysMap = activeDaysBySalesFrom(kpiLogsMonth);

  // Rumus KPI dari SATU sumber (lib/sales-kpi-values.ts)
  const gradeFor = (salesId: string) => {
    const myStores = gradeStores.filter((s) => s.salesId === salesId);
    const captainArea = salesList.find((u) => u.id === salesId)?.captainArea;
    const kpiValues = computeSalesKpiValues({
      stores: myStores,
      ordersMonth: kpiOrdersMonth,
      prospects,
      activeDays: activeDaysMap.get(salesId) ?? 0,
      monthStart,
    });
    return computeLevel(
      kpiValues,
      scoreTargets,
      captainArea,
      priorScores.get(salesId) ?? [],
    );
  };

  // Admin: papan grade & level semua sales; sales: grade dirinya sendiri.
  // Bentuk {g,lvl} dipertahankan supaya JSX di bawah minim ubah.
  const toBoard = (r: ReturnType<typeof computeLevel>) => ({
    g: {
      grade: r.grade as "S+" | "S" | "A" | "B" | "C" | "D" | "E",
      score: r.avgScore,
      parts: r.milestones,
    },
    lvl: { level: r.level, name: r.levelName },
  });
  const gradeBoard = salesList
    .map((s) => ({ ...s, ...toBoard(gradeFor(s.id)) }))
    .sort((a, b) => b.g.score - a.g.score);
  const myBoard = isAdmin ? null : toBoard(gradeFor(user.id));
  const myGrade = myBoard?.g ?? null;
  const myLevel = myBoard?.lvl ?? null;

  // Tab penugasan: admin = form beri tugas + daftar; sales = tugas dari admin
  const penugasanNode = isAdmin ? (
    <div className="space-y-4">
      {/* Papan grade huruf & level sales — rumus sama dengan Performa Sales */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 font-semibold">
          <Award className="h-4 w-4 text-neutral-500" />
          Grade & Level Sales
        </h2>
        <p className="mb-3 text-xs text-neutral-400">
          Gabungan omzet, konter loyal, keaktifan, KPI tugas, dan rating owner
          - klik nama untuk detailnya.
        </p>
        {gradeBoard.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada akun sales.</p>
        ) : (
          <div className="divide-y divide-neutral-100">
            {gradeBoard.map((s) => (
              <div
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/sales/${s.id}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {s.name}
                  </Link>
                  <p className="truncate text-xs text-neutral-400">
                    {s.g.parts.filter((p) => p.done).length}/{s.g.parts.length}{" "}
                    syarat naik beres · {s.g.score}% menuju naik
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1.5">
                  <LevelBadge level={s.lvl.level} name={s.lvl.name} />
                  {s.g.grade && <GradeBadge grade={s.g.grade} />}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 flex items-center gap-2 font-semibold">
          <ClipboardList className="h-4 w-4 text-neutral-500" />
          Beri Tugas ke Sales
        </h2>
        <TaskAssignForm
          salesList={salesList}
          stores={stores.map((s) => ({ id: s.id, name: s.name }))}
        />
      </div>
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Tugas Aktif ({taskCount})</h2>
        {tasks.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada tugas.</p>
        ) : (
          <Paginated
            perPage={6}
            className="divide-y divide-neutral-100"
            items={tasks.map(adminTaskRow)}
          />
        )}
      </div>
    </div>
  ) : tasks.length === 0 ? (
    <EmptyCard text="Belum ada tugas dari admin." />
  ) : (
    <div className="space-y-4">
      {/* Grade huruf & level pribadi — rumus sama dengan Beranda */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-semibold">
              <Award className="h-4 w-4 text-neutral-500" />
              Grade Kamu
            </h2>
            <p className="mt-1.5">
              <LevelBadge level={myLevel!.level} name={myLevel!.name} />
            </p>
            <p className="mt-1 text-xs text-neutral-400">
              {myGrade!.parts.filter((p) => p.done).length}/
              {myGrade!.parts.length} syarat naik beres · {myGrade!.score}%
              menuju naik
            </p>
          </div>
          {myGrade!.grade ? (
            <GradeBadge grade={myGrade!.grade} size="lg" />
          ) : (
            <span className="shrink-0 text-xs text-neutral-400">
              Belum dinilai
            </span>
          )}
        </div>
        <p className="mt-2 border-t border-neutral-100 pt-2 text-[11px] text-neutral-400">
          Cara menaikkan grade & level ada di Beranda, bagian Cara Naik Level.
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <Paginated
          perPage={6}
          className="divide-y divide-neutral-100"
          items={tasks.map(salesTaskRow)}
        />
      </div>
    </div>
  );

  const penugasanTab = {
    key: "penugasan",
    label: isAdmin ? "Tugas Sales" : "Dari Admin",
    count: taskCount,
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tugas</h1>
        <p className="text-sm text-neutral-500">
          {totalTugas > 0
            ? `${totalTugas} tugas menunggu - ${isAdmin ? "semua toko" : "dari toko yang kamu pegang"}`
            : "Tidak ada tugas menunggu"}
        </p>
      </div>

      <TugasTabs
        tabs={[
          penugasanTab,
          { key: "orderan", label: "Orderan Masuk", count: orderCount },
          { key: "request", label: "Request", count: freeRequests.length },
          { key: "keluhan", label: "Keluhan", count: tickets.length },
          { key: "kunjungan", label: "Kunjungan", count: unvisited.length },
        ]}
        sections={[
          { tab: "penugasan", node: penugasanNode },
          {
            tab: "orderan",
            node:
              orderCount === 0 ? (
                <EmptyCard text="Tidak ada orderan yang perlu diproses." />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  {/* Alur: bayar → packing gudang → pickup kurir → sampai.
                      Aksi langsung di baris; begitu ditandai, item pindah
                      state berikutnya. */}
                  {packing.length > 0 && (
                    <>
                      <StateHeader
                        icon={Package}
                        title={
                          isAdmin ? "Perlu Dipacking Gudang" : "Disiapkan Gudang"
                        }
                        n={packing.length}
                      />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={packing.map((o) => (
                          <div
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                          >
                            {orderInfo(o)}
                            {isAdmin ? (
                              <form
                                action={async () => {
                                  "use server";
                                  await markOrderReady(o.id);
                                }}
                              >
                                <SubmitButton
                                  pendingText="Memproses…"
                                  overlayText="Menandai siap dipickup…"
                                  className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                                >
                                  <PackageCheck className="h-3.5 w-3.5" />
                                  Siap Dipickup
                                </SubmitButton>
                              </form>
                            ) : (
                              <span className="text-xs text-neutral-400">
                                Menunggu gudang selesai packing
                              </span>
                            )}
                          </div>
                        ))}
                      />
                    </>
                  )}

                  {pickup.length > 0 && (
                    <>
                      <StateHeader
                        icon={Truck}
                        title="Siap Dipickup Kurir"
                        n={pickup.length}
                      />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={pickup.map((o) => (
                          <div
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                          >
                            {orderInfo(o)}
                            <form
                              action={async () => {
                                "use server";
                                await pickupOrder(o.id);
                              }}
                            >
                              <SubmitButton
                                pendingText="Memproses…"
                                overlayText="Menandai barang dipickup…"
                                className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                              >
                                <Truck className="h-3.5 w-3.5" />
                                Pickup Barang
                              </SubmitButton>
                            </form>
                          </div>
                        ))}
                      />
                    </>
                  )}

                  {diJalan.length > 0 && (
                    <>
                      <StateHeader
                        icon={PackageCheck}
                        title="Di Jalan - Tunggu Report"
                        n={diJalan.length}
                      />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={diJalan.map((o) => (
                          <div
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                          >
                            {orderInfo(o)}
                            <DeliveryReportForm orderId={o.id} />
                          </div>
                        ))}
                      />
                    </>
                  )}

                  {belumBayar.length > 0 && (
                    <>
                      <StateHeader
                        icon={CreditCard}
                        title="Menunggu Pembayaran"
                        n={belumBayar.length}
                      />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={belumBayar.map((o) => {
                          const wa = waLink(
                            o.store.ownerPhone,
                            `Halo${o.store.ownerName ? " " + o.store.ownerName : ""}, orderan restok #${o.id.slice(-8).toUpperCase()} di ${o.store.name} (total ${rupiah(o.total)}) belum dibayar. Mohon diselesaikan ya, terima kasih.`,
                          );
                          return (
                            <div
                              key={o.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                            >
                              {orderInfo(o)}
                              {wa && (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  Ingatkan
                                </a>
                              )}
                            </div>
                          );
                        })}
                      />
                    </>
                  )}
                </div>
              ),
          },
          {
            tab: "request",
            node:
              freeRequests.length === 0 ? (
                <EmptyCard text="Tidak ada request yang menunggu dibalas." />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <Paginated
                    perPage={5}
                    className="divide-y divide-neutral-100"
                    items={freeRequests.map((r) => {
                      const wa = waLink(
                        r.store.ownerPhone,
                        `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal request "${r.subject}" dari ${r.store.name}.`,
                      );
                      return (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <Link href="/request" className="min-w-0 flex-1 hover:underline">
                            <span className="block truncate text-sm font-medium">
                              {r.subject} - {r.store.name}
                            </span>
                            <span className="block truncate text-xs text-neutral-400">
                              {r.message.slice(0, 60)} · {fmtDate(r.createdAt)}
                            </span>
                          </Link>
                          <div className="flex shrink-0 gap-1.5">
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                Chat
                              </a>
                            )}
                            <form action={updateRequestStatus.bind(null, r.id, "COMPLETED")}>
                              <SubmitButton
                                pendingText="Memproses…"
                                overlayText="Menandai request selesai…"
                                className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                              >
                                Tandai Selesai
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  />
                </div>
              ),
          },
          {
            tab: "keluhan",
            node:
              tickets.length === 0 ? (
                <EmptyCard text="Tidak ada keluhan terbuka. Mantap!" />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <Paginated
                    perPage={5}
                    className="divide-y divide-neutral-100"
                    items={tickets.map((t) => (
                      <Link
                        key={t.id}
                        href={`/konter/${t.storeId}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-neutral-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {t.subject} - {t.store.name}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            Status {t.status} · {fmtDate(t.createdAt)}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
                      </Link>
                    ))}
                  />
                </div>
              ),
          },
          {
            tab: "kunjungan",
            node:
              unvisited.length === 0 ? (
                <EmptyCard text="Semua konter sudah dikunjungi." />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <Paginated
                    perPage={5}
                    className="divide-y divide-neutral-100"
                    items={unvisited.map((s) => (
                      <Link
                        key={s.id}
                        href="/konter"
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-neutral-50"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                            <Store className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            {s.name}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            {s.area ?? "Area belum diisi"} · belum ada prospek
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
                      </Link>
                    ))}
                  />
                </div>
              ),
          },
        ]}
      />
    </div>
  );
}
