import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StageBadge, ResultBadge } from "@/components/Badge";
import { AddLogForm } from "@/components/AddLogForm";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/constants";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Clock,
  ThumbsUp,
  ThumbsDown,
} from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default async function ProspectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  const prospect = await prisma.prospect.findUnique({
    where: { id },
    include: {
      store: true,
      product: true,
      sales: true,
      logs: { include: { sales: true }, orderBy: { createdAt: "desc" } },
    },
  });

  if (!prospect) notFound();

  // Cek akses sesuai role
  if (user.role === "SALES" && prospect.salesId !== user.id) redirect("/prospects");
  if (user.role === "OWNER" && prospect.store.ownerUserId !== user.id)
    redirect("/prospects");

  const canEdit = user.role !== "OWNER";
  const stageIndex = STAGES.indexOf(prospect.stage as Stage);

  // --- Analisa ---
  const salesRows = await prisma.sale.findMany({
    where: { storeId: prospect.storeId, productId: prospect.productId },
    select: { qty: true, total: true, createdAt: true },
  });
  const unitsSold = salesRows.reduce((a, s) => a + s.qty, 0);
  const revenue = salesRows.reduce((a, s) => a + s.total, 0);
  const remaining = Math.max(0, prospect.stock - unitsSold);

  // Titik penjualan barang ini di konter ini (filter rentang di client)
  const salesPoints = salesRows.map((s) => ({
    ts: new Date(s.createdAt).getTime(),
    total: s.total,
  }));

  const resCount: Record<string, number> = {
    POSITIVE: 0,
    NEUTRAL: 0,
    REJECTED: 0,
  };
  for (const l of prospect.logs) resCount[l.result] = (resCount[l.result] ?? 0) + 1;

  const positiveLogs = prospect.logs.filter((l) => l.result === "POSITIVE");
  const rejectedLogs = prospect.logs.filter((l) => l.result === "REJECTED");
  const latest = prospect.logs[0];
  const won = prospect.stage === "ACTION" || prospect.stage === "LOYALTY";
  const rejected = !won && latest?.result === "REJECTED";

  const verdict = won
    ? {
        label: "Laku / Closing",
        sub: "Toko sepakat ambil barang",
        cls: "border-green-200 bg-green-50 text-green-700",
        Icon: CheckCircle2,
      }
    : rejected
      ? {
          label: "Ditolak",
          sub: "Belum berhasil, lihat hambatan di bawah",
          cls: "border-red-200 bg-red-50 text-red-700",
          Icon: XCircle,
        }
      : {
          label: "Dalam Proses",
          sub: "Masih digarap, belum closing",
          cls: "border-neutral-200 bg-neutral-50 text-neutral-700",
          Icon: Clock,
        };

  return (
    <div className="space-y-5">
      <Link
        href="/prospects"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke tracker
      </Link>

      {/* Header prospek */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">{prospect.product.name}</h1>
            <p className="text-neutral-500">
              {prospect.store.name}
              {prospect.store.area ? ` · ${prospect.store.area}` : ""}
            </p>
          </div>
          <StageBadge stage={prospect.stage} />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {prospect.store.ownerName && (
            <div>
              <dt className="text-neutral-400">Owner Toko</dt>
              <dd>{prospect.store.ownerName}</dd>
            </div>
          )}
          {prospect.store.ownerPhone && (
            <div>
              <dt className="text-neutral-400">Kontak</dt>
              <dd>{prospect.store.ownerPhone}</dd>
            </div>
          )}
          {prospect.store.address && (
            <div className="col-span-2">
              <dt className="text-neutral-400">Alamat</dt>
              <dd>{prospect.store.address}</dd>
            </div>
          )}
          <div>
            <dt className="text-neutral-400">Sales</dt>
            <dd>{prospect.sales?.name ?? "—"}</dd>
          </div>
        </dl>
      </div>

      {/* Progress funnel */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Posisi Funnel</h2>
        <div className="flex items-center justify-between gap-1">
          {STAGES.map((s, i) => (
            <div key={s} className="flex flex-1 flex-col items-center gap-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                  i <= stageIndex
                    ? "bg-neutral-900 text-white"
                    : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {i + 1}
              </div>
              <span
                className={`text-center text-[10px] ${
                  i <= stageIndex ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                {STAGE_LABEL[s]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Analisa prospek */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Analisa Prospek</h2>

        {/* Verdict */}
        <div className={`rounded-lg border p-3 ${verdict.cls}`}>
          <div className="flex items-center gap-1.5 text-sm font-semibold">
            <verdict.Icon className="h-4 w-4" />
            {verdict.label}
          </div>
          <p className="mt-0.5 text-xs opacity-80">{verdict.sub}</p>
        </div>

        {/* Stok / terjual / sisa / nilai */}
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">Stok Dikasih</p>
            <p className="text-xl font-bold">{prospect.stock}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">Terjual</p>
            <p className="text-xl font-bold">{unitsSold}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">Sisa</p>
            <p className="text-xl font-bold">{remaining}</p>
          </div>
          <div className="rounded-lg border border-neutral-200 p-3">
            <p className="text-xs text-neutral-500">Nilai Penjualan</p>
            <p className="text-lg font-bold">{rupiah(revenue)}</p>
          </div>
        </div>

        {/* Tren penjualan */}
        {unitsSold > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Tren Penjualan
            </p>
            <SalesTrendChart sales={salesPoints} />
          </div>
        )}

        {/* Ringkasan interaksi */}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-green-700">
            {resCount.POSITIVE} respons positif
          </span>
          <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">
            {resCount.REJECTED} penolakan
          </span>
          <span className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-neutral-600">
            {resCount.NEUTRAL} netral
          </span>
        </div>

        {/* Alasan / faktor */}
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-green-700">
              <ThumbsUp className="h-3.5 w-3.5" /> Faktor Pendukung
            </p>
            {positiveLogs.length === 0 ? (
              <p className="text-xs text-neutral-400">Belum ada.</p>
            ) : (
              <ul className="space-y-1.5">
                {positiveLogs.map((l) => (
                  <li key={l.id} className="text-sm text-neutral-700">
                    <span className="text-neutral-400">
                      [{STAGE_LABEL[l.stage as Stage] ?? l.stage}]
                    </span>{" "}
                    {l.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-red-700">
              <ThumbsDown className="h-3.5 w-3.5" /> Hambatan / Alasan Ditolak
            </p>
            {rejectedLogs.length === 0 ? (
              <p className="text-xs text-neutral-400">Belum ada.</p>
            ) : (
              <ul className="space-y-1.5">
                {rejectedLogs.map((l) => (
                  <li key={l.id} className="text-sm text-neutral-700">
                    <span className="text-neutral-400">
                      [{STAGE_LABEL[l.stage as Stage] ?? l.stage}]
                    </span>{" "}
                    {l.note}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Form tambah update */}
      {canEdit && (
        <AddLogForm prospectId={prospect.id} currentStage={prospect.stage} />
      )}

      {/* Riwayat */}
      <div className="rounded-xl border border-neutral-200 bg-white p-5">
        <h2 className="mb-3 font-semibold">Riwayat ({prospect.logs.length})</h2>
        {prospect.logs.length === 0 ? (
          <p className="text-sm text-neutral-400">Belum ada update.</p>
        ) : (
          <ol className="space-y-4">
            {prospect.logs.map((log) => (
              <li key={log.id} className="border-l-2 border-neutral-200 pl-4">
                <div className="flex flex-wrap items-center gap-2">
                  <StageBadge stage={log.stage} />
                  <ResultBadge result={log.result} />
                  {log.quantity > 0 && (
                    <span className="text-xs text-neutral-500">
                      {log.quantity} unit
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm">{log.note}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {log.sales?.name ?? "—"} ·{" "}
                  {new Date(log.createdAt).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
