import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StageBadge, GradeBadge, LevelBadge } from "@/components/Badge";
import { Paginated } from "@/components/Paginated";
import { rupiah, rupiahShort } from "@/lib/format";
import { STAGES, type Stage } from "@/lib/constants";
import { StarRating } from "@/components/StarRating";
import { PeriodeFilter } from "@/components/PeriodeFilter";
import { CommissionForm } from "@/components/CommissionForm";
import { CaptainForm } from "@/components/CaptainForm";
import { DeleteWithConfirm } from "@/components/DataActions";
import { PayoutForm } from "@/components/PayoutForm";
import {
  deleteSalesAccount,
  deleteCommissionPayout,
} from "@/app/actions/users";
import { taskGrade, gradeSummary } from "@/lib/task-grade";
import { computeLevel } from "@/lib/sales-kpi-grade";
import {
  computeSalesKpiValues,
  activeDaysBySalesFrom,
} from "@/lib/sales-kpi-values";
import { getLevelTargets } from "@/lib/kpi-config";
import { salesKpi } from "@/lib/sales-kpi";
import { wibMonthStart } from "@/lib/date";
import { parsePeriode, periodeStart, PERIODE_LABEL } from "@/lib/periode";
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
  hint,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
  warn?: boolean;
  hint?: string;
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
      {hint && (
        <p className="mt-0.5 truncate text-xs text-neutral-400">{hint}</p>
      )}
    </div>
  );
}

export default async function SalesDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ periode?: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  const sales = await prisma.user.findUnique({ where: { id } });
  if (!sales || sales.role !== "SALES") notFound();

  // Filter periode omzet & komisi (?periode=minggu|bulan)
  const periode = parsePeriode((await searchParams).periode);
  const start = periodeStart(periode);

  // Jendela 4 KPI operasional: bulan berjalan + bulan lalu (pembanding)
  const monthStart = wibMonthStart();
  const prevMonthStart = wibMonthStart(new Date(monthStart.getTime() - 1));

  const [stores, saleRows, tasks, saleTotals, allStores, kpiOrders, kpiSales, ratings, restokAgg, feeOrders, payouts] =
    await Promise.all([
    prisma.store.findMany({
      where: { salesId: id },
      include: {
        prospects: {
          include: { logs: { orderBy: { createdAt: "desc" }, take: 1 } },
        },
      },
      orderBy: { name: "asc" },
    }),
    // Omzet per konter dalam periode — agregat di DB, bukan tarik semua baris
    prisma.sale.groupBy({
      by: ["storeId"],
      where: {
        store: { salesId: id },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
      _sum: { total: true },
    }),
    prisma.task.findMany({
      where: { assignedToId: id },
      include: { store: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    }),
    // Omzet semua waktu per konter (agregat di DB) + pemegang tiap konter —
    // pembanding grade huruf (omzet sales ini vs sales terbaik di tim).
    prisma.sale.groupBy({ by: ["storeId"], _sum: { total: true } }),
    prisma.store.findMany({ select: { id: true, salesId: true } }),
    // Bahan 4 KPI operasional (lib/sales-kpi.ts): order restok lunas &
    // transaksi POS sejak bulan lalu
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        createdAt: { gte: prevMonthStart },
        store: { salesId: id },
      },
      select: {
        storeId: true,
        createdAt: true,
        total: true,
        items: { select: { qty: true } },
      },
    }),
    prisma.sale.findMany({
      where: { store: { salesId: id }, createdAt: { gte: prevMonthStart } },
      select: { storeId: true, createdAt: true, qty: true, total: true },
    }),
    // Rating bintang + keterangan dari owner konter untuk sales ini
    prisma.salesRating.findMany({
      where: { salesId: id },
      include: { store: { select: { name: true, ownerName: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    // Omzet RESTOK (order lunas) konter sales ini dalam periode — dasar
    // komisi affiliator (bukan POS: yang dihitung toko belanja barang kita).
    prisma.request.aggregate({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        store: { salesId: id },
        ...(start ? { createdAt: { gte: start } } : {}),
      },
      _sum: { total: true },
    }),
    // SEMUA order lunas (semua waktu) — bahan saldo fee belum dicairkan
    // (fee dihitung per order, sama dengan halaman /penghasilan sales)
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        store: { salesId: id },
      },
      select: { total: true },
    }),
    prisma.commissionPayout.findMany({
      where: { salesId: id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const ratingAvg =
    ratings.length > 0
      ? Math.round(
          (ratings.reduce((a, r) => a + r.stars, 0) / ratings.length) * 10,
        ) / 10
      : null;

  // 4 KPI operasional: bulan ini vs bulan lalu
  const kpiInput = {
    stores,
    orders: kpiOrders.map((o) => ({
      storeId: o.storeId,
      createdAt: o.createdAt,
      pcs: o.items.reduce((a, it) => a + it.qty, 0),
    })),
    sales: kpiSales,
  };
  const kpiNow = salesKpi(kpiInput, { from: monthStart, to: null });
  const kpiPrev = salesKpi(kpiInput, { from: prevMonthStart, to: monthStart });

  const revenueByStore = new Map(
    saleRows.map((s) => [s.storeId, s._sum.total ?? 0]),
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
  const loyal = konter.filter(
    (s) => s.furthest === "LOYALTY" || s.furthest === "STAR_SELLER",
  ).length;
  const terbengkalai = konter.filter((s) => s.neglected).length;
  const taskDone = tasks.filter((t) => t.status === "DONE").length;
  // Grade KPI dari tugas admin — rumus sama dengan menu Tugas & /sales
  const grade = taskGrade(tasks);
  // Komisi affiliator: persen (diatur admin di bawah) × omzet RESTOK
  // (order lunas) konternya di periode ini — bukan POS.
  const restokRevenue = restokAgg._sum.total ?? 0;
  const commission = Math.round((restokRevenue * sales.commissionPct) / 100);

  // Saldo pencairan fee (semua waktu, per order — rumus sama dengan
  // halaman /penghasilan sales): total fee − total sudah dicairkan.
  const feeAllTime = feeOrders.reduce(
    (s, o) => s + Math.round((o.total * sales.commissionPct) / 100),
    0,
  );
  const paidOutTotal = payouts.reduce((s, p) => s + p.amount, 0);
  const feeOutstanding = feeAllTime - paidOutTotal;

  // ===== Level MILESTONE — rumus KPI dari SATU sumber, sama dgn beranda,
  // leaderboard, & /tugas (lib/sales-kpi-values.ts) =====
  const levelTargets = await getLevelTargets();
  const kpiLogRows = await prisma.stageLog.findMany({
    where: { salesId: id, createdAt: { gte: monthStart } },
    select: { salesId: true, createdAt: true },
  });
  const activeDays = activeDaysBySalesFrom(kpiLogRows).get(id) ?? 0;
  const kpiValues = computeSalesKpiValues({
    stores,
    ordersMonth: kpiOrders.filter((o) => o.createdAt >= monthStart),
    prospects: stores.flatMap((st) =>
      st.prospects.map((p) => ({ storeId: st.id, stage: p.stage })),
    ),
    activeDays,
    monthStart,
  });
  const result = computeLevel(kpiValues, levelTargets, sales.captainArea);
  // Alias supaya JSX (letter/lvl) tetap jalan dengan model baru
  const letter = {
    grade: result.grade as "S+" | "S" | "A" | "B" | "C" | "D" | "E",
    score: result.progress,
    parts: result.milestones,
  };
  const lvl = { level: result.level, name: result.levelName };

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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{sales.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-neutral-500">
              <Phone className="h-3.5 w-3.5 shrink-0" />
              {sales.phone}
            </p>
            {sales.nik && (
              <p className="mt-0.5 text-xs text-neutral-400">
                NIK {sales.nik}
              </p>
            )}
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <LevelBadge level={lvl.level} name={lvl.name} />
              {sales.captainArea && (
                <span className="text-xs text-neutral-500">
                  Wilayah {sales.captainArea}
                </span>
              )}
            </p>
          </div>
          {/* Grade huruf leveling + grade KPI tugas (bintang menu Tugas).
              Di HP blok ini turun jadi baris sendiri rata kiri dan boleh
              menyusut (min-w-0) — teks rincian panjang wrap, tidak
              mendorong halaman melebar. */}
          <div className="min-w-0 text-left sm:text-right">
            {letter.grade && (
              <p className="mb-1.5 flex items-center gap-2 sm:justify-end">
                <span className="text-xs text-neutral-400">
                  {result.nextLevel
                    ? `${letter.score}% menuju naik`
                    : "Level puncak"}
                </span>
                <GradeBadge grade={letter.grade} size="lg" />
              </p>
            )}
            {/* Bintang = rating dari owner konter (bukan grade tugas) —
                ulasan lengkapnya di section "Rating dari Owner" di bawah */}
            {ratingAvg === null ? (
              <p className="text-xs text-neutral-400">
                Belum ada rating dari owner
              </p>
            ) : (
              <p className="flex items-center gap-1.5 sm:justify-end">
                <StarRating value={ratingAvg} size="h-5 w-5" />
                <span className="text-lg font-bold">
                  {ratingAvg.toLocaleString("id-ID", {
                    minimumFractionDigits: 1,
                    maximumFractionDigits: 1,
                  })}
                </span>
                <span className="text-xs text-neutral-400">
                  ({ratings.length} owner)
                </span>
              </p>
            )}
            <p className="mt-0.5 text-xs text-neutral-400">
              Tugas: {gradeSummary(grade)}
            </p>
            {letter.parts.length > 0 && (
              <p className="mt-0.5 text-xs text-neutral-400">
                {letter.parts.filter((p) => p.done).length}/
                {letter.parts.length} syarat naik level beres
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Filter periode omzet & komisi */}
      <PeriodeFilter current={periode} basePath={`/sales/${id}`} />

      {/* KPI */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi
          label={`Omzet (${PERIODE_LABEL[periode]})`}
          value={rupiahShort(totalRevenue)}
          accent
        />
        <Kpi
          label={`Komisi ${sales.commissionPct > 0 ? `${sales.commissionPct}%` : ""}`}
          value={sales.commissionPct > 0 ? rupiahShort(commission) : "—"}
          accent={commission > 0}
        />
        <Kpi label="Konter" value={konter.length} />
        <Kpi label="Konter Loyal" value={loyal} />
        <Kpi label="Terbengkalai" value={terbengkalai} warn={terbengkalai > 0} />
        <Kpi label="Tugas" value={`${taskDone}/${tasks.length}`} />
      </div>

      {/* 4 KPI operasional bulan berjalan (lib/sales-kpi.ts) */}
      <div>
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
          KPI bulan ini · pembanding bulan lalu
        </p>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi
            label="Seeding Konter Baru"
            value={kpiNow.seeding}
            hint={`Bulan lalu ${kpiPrev.seeding}`}
          />
          <Kpi
            label="Konversi Konter Aktif"
            value={kpiNow.konversi !== null ? `${kpiNow.konversi}%` : "—"}
            hint={`${kpiNow.aktif} konter reorder · bulan lalu ${
              kpiPrev.konversi !== null ? `${kpiPrev.konversi}%` : "—"
            }`}
          />
          <Kpi
            label="Reorder / Konter Aktif"
            value={kpiNow.reorder !== null ? `${kpiNow.reorder} pcs` : "—"}
            hint={`Bulan lalu ${
              kpiPrev.reorder !== null ? `${kpiPrev.reorder} pcs` : "—"
            }`}
          />
          <Kpi
            label="Harga Jual Rata-rata"
            value={kpiNow.harga !== null ? rupiahShort(kpiNow.harga) : "—"}
            hint={`per pcs · bulan lalu ${
              kpiPrev.harga !== null ? rupiahShort(kpiPrev.harga) : "—"
            }`}
          />
        </div>
      </div>

      {/* Pengaturan komisi affiliator (admin) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Komisi Affiliator</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Persen dari omzet restok (order lunas) konter yang dipegang{" "}
          {sales.name} — yang dihitung uang toko belanja barang kita, bukan
          penjualan POS. Nilainya mengikuti filter periode di atas — cocok
          untuk rekap pembayaran komisi mingguan/bulanan.
        </p>
        <div className="max-w-xs">
          <CommissionForm salesId={id} currentPct={sales.commissionPct} />
        </div>
      </section>

      {/* Pencairan fee bagi hasil (admin) — saldo belum dicairkan reset ke 0
          setelah dibayar penuh; tiap pencairan otomatis masuk buku kas */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Pencairan Fee</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Saldo belum dicairkan = total fee semua waktu − total pencairan.
          Tiap pencairan otomatis tercatat sebagai pengeluaran buku kas
          (kategori &ldquo;Komisi sales&rdquo;) dan {sales.name} dapat
          notifikasi.
        </p>

        <div className="mb-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs text-neutral-500">Total fee</p>
            <p className="mt-0.5 truncate text-sm font-bold">
              {rupiah(feeAllTime)}
            </p>
          </div>
          <div className="rounded-xl bg-neutral-50 p-3">
            <p className="text-xs text-neutral-500">Sudah dicairkan</p>
            <p className="mt-0.5 truncate text-sm font-bold">
              {rupiah(paidOutTotal)}
            </p>
          </div>
          <div className="rounded-xl bg-neutral-900 p-3">
            <p className="text-xs text-neutral-400">Belum dicairkan</p>
            <p
              className={`mt-0.5 truncate text-sm font-bold ${
                feeOutstanding < 0 ? "text-red-400" : "text-brand"
              }`}
            >
              {rupiah(feeOutstanding)}
            </p>
          </div>
        </div>

        <div className="max-w-md">
          <PayoutForm salesId={id} suggested={feeOutstanding} />
        </div>

        {payouts.length > 0 && (
          <ul className="mt-4 divide-y divide-neutral-100 border-t border-neutral-100">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{rupiah(p.amount)}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {fmtDate(p.createdAt)}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <DeleteWithConfirm
                  action={deleteCommissionPayout.bind(null, p.id)}
                  title="Hapus pencairan"
                  confirmText={`Hapus pencairan ${rupiah(p.amount)}? Entri buku kasnya ikut terhapus dan saldo belum dicairkan naik lagi.`}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Angkat Sales Captain — level 5 rahasia (admin) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Sales Captain</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Level 5 (rahasia) — angkat {sales.name} jadi kepala sales untuk satu
          wilayah. Satu wilayah hanya boleh punya satu captain; kosongkan lalu
          simpan untuk mencabut. Level ini tidak pernah ditampilkan sebagai
          jenjang berikutnya ke sales.
        </p>
        <div className="max-w-xs">
          <CaptainForm salesId={id} currentArea={sales.captainArea} />
        </div>
      </section>

      {/* Hapus akun sales (admin) */}
      <section className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold text-red-600">Hapus Akun Sales</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Akun {sales.name} dihapus permanen dan tidak bisa login lagi. Konter
          yang dia pegang jadi tanpa sales (tinggal dialihkan di menu Data);
          riwayat kunjungan & transaksi tetap tersimpan.
        </p>
        <DeleteWithConfirm
          action={async () => {
            "use server";
            await deleteSalesAccount(id);
            redirect("/sales");
          }}
          confirmText={`Hapus akun sales ${sales.name}? Tindakan ini tidak bisa dibatalkan.`}
          title="Hapus akun sales"
          className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          Hapus Akun
        </DeleteWithConfirm>
      </section>

      {/* Rating & ulasan dari owner konter (diisi owner di halaman POS) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Rating dari Owner ({ratings.length})</h2>
          {ratingAvg !== null && (
            <span className="flex items-center gap-1.5">
              <StarRating value={ratingAvg} size="h-4 w-4" />
              <span className="text-sm font-bold">
                {ratingAvg.toLocaleString("id-ID", {
                  minimumFractionDigits: 1,
                  maximumFractionDigits: 1,
                })}
              </span>
            </span>
          )}
        </div>
        <Paginated
          perPage={5}
          className="space-y-2"
          empty={
            <p className="text-sm text-neutral-400">
              Belum ada rating — owner konter bisa memberi rating dari
              halaman POS tokonya.
            </p>
          }
          items={ratings.map((r) => (
            <div key={r.id} className="rounded-lg border border-neutral-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">
                  {r.store.name}
                  {r.store.ownerName && (
                    <span className="font-normal text-neutral-400">
                      {" "}
                      · {r.store.ownerName}
                    </span>
                  )}
                </p>
                <span className="flex shrink-0 items-center gap-1">
                  <StarRating value={r.stars} size="h-3.5 w-3.5" />
                  <span className="text-xs font-bold">{r.stars}/5</span>
                </span>
              </div>
              {r.note && (
                <p className="mt-1 text-sm text-neutral-600">
                  &ldquo;{r.note}&rdquo;
                </p>
              )}
              <p className="mt-1 text-xs text-neutral-400">
                {fmtDate(r.updatedAt)}
              </p>
            </div>
          ))}
        />
      </section>

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
