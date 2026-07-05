"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { MapPoint, StoreRevenuePoint, InterestFilter } from "./MapInner";

// Leaflet butuh window → matikan SSR
const MapInner = dynamic(() => import("./MapInner"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-sm text-neutral-400">
      Memuat peta…
    </div>
  ),
});

const FILTERS: { key: InterestFilter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "POSITIVE", label: "Tertarik" },
  { key: "REJECTED", label: "Tidak Tertarik" },
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
}: {
  points: MapPoint[];
  storePoints?: StoreRevenuePoint[];
}) {
  const [filter, setFilter] = useState<InterestFilter>("ALL");

  const count = {
    POSITIVE: points.filter((p) => p.result === "POSITIVE").length,
    REJECTED: points.filter((p) => p.result === "REJECTED").length,
    ALL: points.length,
  };

  return (
    <div className="space-y-2">
      {/* Toolbar: filter + legend */}
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
            {f.label} ({count[f.key]})
          </button>
        ))}

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
        </div>
      </div>

      {storePoints.length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-neutral-500">
          <span className="inline-block h-3 w-3 shrink-0 rounded-full border border-brand-dark bg-brand/50" />
          Ukuran lingkaran = besar kontribusi penjualan konter itu
        </p>
      )}

      <div className="relative z-0 h-[420px] w-full overflow-hidden rounded-xl border border-neutral-200 bg-white">
        <MapInner points={points} filter={filter} storePoints={storePoints} />
      </div>
    </div>
  );
}
