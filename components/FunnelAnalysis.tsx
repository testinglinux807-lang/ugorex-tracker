"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, ArrowUpRight } from "lucide-react";
import { StageBadge } from "@/components/Badge";
import { Paginated } from "@/components/Paginated";
import { rupiahShort } from "@/lib/format";
import {
  STAGES,
  STAGE_LABEL,
  RESULT_LABEL,
  RESULT_COLOR,
  type Stage,
  type Result,
} from "@/lib/constants";

// Ringkasan funnel satu konter — semua field serializable (dibangun di server).
export type StoreFunnel = {
  storeId: string;
  name: string;
  area: string | null;
  salesId: string | null;
  sales: string | null;
  totalProspek: number;
  stageCounts: Record<Stage, number>;
  furthest: Stage; // tahap terjauh yang dicapai konter ini
  lastResult: Result;
  lastActivity: string | null; // ISO, aktivitas funnel terakhir
  revenue: number; // omzet konter (dari transaksi POS)
};

type Sort = "stage" | "revenue" | "activity";

const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";

export function FunnelAnalysis({ stores }: { stores: StoreFunnel[] }) {
  const [q, setQ] = useState("");
  const [stage, setStage] = useState<Stage | "ALL">("ALL");
  const [area, setArea] = useState<string>("ALL");
  const [sort, setSort] = useState<Sort>("stage");

  const areas = useMemo(
    () =>
      Array.from(
        new Set(stores.map((s) => s.area).filter((a): a is string => !!a)),
      ).sort(),
    [stores],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = stores.filter((s) => {
      if (needle && !s.name.toLowerCase().includes(needle)) return false;
      if (area !== "ALL" && s.area !== area) return false;
      // Filter tahap: konter yang punya minimal 1 prospek di tahap itu.
      if (stage !== "ALL" && (s.stageCounts[stage] || 0) === 0) return false;
      return true;
    });
    return rows.sort((a, b) => {
      if (sort === "revenue") return b.revenue - a.revenue;
      if (sort === "activity")
        return (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "");
      // stage: tahap terjauh dulu, lalu aktivitas terbaru
      return (
        STAGES.indexOf(b.furthest) - STAGES.indexOf(a.furthest) ||
        (b.lastActivity ?? "").localeCompare(a.lastActivity ?? "")
      );
    });
  }, [stores, q, stage, area, sort]);

  const rows = filtered.map((s) => (
    <Link
      key={s.storeId}
      href={`/konter/${s.storeId}`}
      className="group block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{s.name}</p>
          <p className="truncate text-sm text-neutral-500">
            {s.area ?? "-"}
            {s.sales ? ` · ${s.sales}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StageBadge stage={s.furthest} />
          <ArrowUpRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-600" />
        </div>
      </div>

      {/* Distribusi tahap: badge kecil per tahap yang ada isinya */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {STAGES.map((st) => {
          const n = s.stageCounts[st] || 0;
          if (n === 0) return null;
          return (
            <span
              key={st}
              className="inline-flex items-center gap-1 rounded-full border border-neutral-200 bg-neutral-50 px-2 py-0.5 text-[11px] text-neutral-600"
            >
              {STAGE_LABEL[st]}
              <span className="font-bold text-neutral-800">{n}</span>
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-2 text-xs text-neutral-400">
        <span>
          <span className="font-semibold text-neutral-700">
            {s.revenue > 0 ? rupiahShort(s.revenue) : "Belum ada omzet"}
          </span>{" "}
          · {s.totalProspek} produk ·{" "}
          <span
            className={`rounded-full border px-1.5 py-0.5 font-medium ${RESULT_COLOR[s.lastResult]}`}
          >
            {RESULT_LABEL[s.lastResult]}
          </span>
        </span>
        <span>Aktivitas: {fmtDate(s.lastActivity)}</span>
      </div>
    </Link>
  ));

  return (
    <div className="space-y-4">
      {/* Kontrol filter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari konter…"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-500"
          />
        </div>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        >
          <option value="ALL">Semua area</option>
          {areas.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as Sort)}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-500"
        >
          <option value="stage">Urut: tahap terjauh</option>
          <option value="revenue">Urut: omzet</option>
          <option value="activity">Urut: aktivitas terbaru</option>
        </select>
      </div>

      {/* Filter tahap — tab garis-bawah, bisa digeser di mobile */}
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {(["ALL", ...STAGES] as const).map((st) => {
          const on = stage === st;
          return (
            <button
              key={st}
              type="button"
              onClick={() => setStage(st)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {st === "ALL" ? "Semua tahap" : STAGE_LABEL[st]}
            </button>
          );
        })}
      </div>

      <p className="text-sm text-neutral-500">{filtered.length} konter</p>

      <Paginated
        perPage={8}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
        empty={
          <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
            <p className="text-neutral-500">Tidak ada konter yang cocok.</p>
          </div>
        }
        items={rows}
      />
    </div>
  );
}
