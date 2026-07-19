"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type {
  MapPoint,
  StoreRevenuePoint,
  StageFilter,
  HomePoint,
} from "./MapInner";
import { STAGES, STAGE_LABEL } from "@/lib/constants";

// Leaflet butuh window → matikan SSR
const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
      Memuat peta…
    </div>
  ),
});

// Filter titik by tahap funnel (Awareness → Star Seller)
const FILTERS: { key: StageFilter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  ...STAGES.map((s) => ({ key: s as StageFilter, label: STAGE_LABEL[s] })),
];

function Dot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-3 w-3 rounded-full border border-neutral-800"
      style={{ backgroundColor: color }}
    />
  );
}

export function TrackerMap({
  points,
  storePoints = [],
  homePoints = [],
}: {
  points: MapPoint[];
  storePoints?: StoreRevenuePoint[];
  // Rumah sales — lingkaran radius kerja 7 km. Beranda sales: 1 titik
  // miliknya; peta admin: semua sales (bisa dimatikan lewat toggle).
  homePoints?: HomePoint[];
}) {
  const [filter, setFilter] = useState<StageFilter>("ALL");
  const [showRadius, setShowRadius] = useState(true);

  // Titik abu-abu (garapan sales lain) cuma info — tidak ikut filter/hitungan
  const own = points.filter((p) => !p.otherSales);
  const otherCount = points.length - own.length;
  const count = (key: StageFilter) =>
    key === "ALL" ? own.length : own.filter((p) => p.stage === key).length;

  return (
    <div className="space-y-2">
      {/* Toolbar: filter by tahap funnel + toggle radius sales */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-neutral-500">Filter:</span>
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              filter === f.key
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {f.label} ({count(f.key)})
          </button>
        ))}
        {/* Toggle radius kerja 7 km dari rumah sales */}
        {homePoints.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRadius((v) => !v)}
            className={`rounded-full border border-dashed px-3 py-1 text-xs font-medium transition ${
              showRadius
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-400 text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            Radius sales ({homePoints.length})
          </button>
        )}

        <div className="ml-auto flex items-center gap-3 text-xs text-neutral-500">
          <span className="flex items-center gap-1">
            <Dot color="#16a34a" /> Tertarik
          </span>
          <span className="flex items-center gap-1">
            <Dot color="#ef4444" /> Tidak
          </span>
          <span className="flex items-center gap-1">
            <Dot color="#ffffff" /> Netral
          </span>
          {otherCount > 0 && (
            <span className="flex items-center gap-1">
              <Dot color="#9ca3af" /> Sales lain ({otherCount})
            </span>
          )}
        </div>
      </div>

      {storePoints.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-brand-dark bg-brand/50" />
          Ukuran lingkaran = besar kontribusi penjualan konter itu
        </p>
      )}

      {homePoints.length > 0 && showRadius && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-dashed border-neutral-700 bg-brand/10" />
          Lingkaran putus-putus = radius kerja 7 km dari rumah sales
        </p>
      )}

      <div className="relative z-0 h-[420px] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <MapInner
          points={points}
          filter={filter}
          storePoints={storePoints}
          homePoints={showRadius ? homePoints : []}
        />
      </div>
    </div>
  );
}
