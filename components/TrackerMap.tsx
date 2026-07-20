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
      {/* Filter tahap funnel: tab garis-bawah (bisa digeser horizontal di
          mobile), bukan tombol pill. */}
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                active
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {f.label}
              <span
                className={`ml-1 font-semibold ${
                  active ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                {count(f.key)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Baris legend + toggle radius (selalu kelihatan, tak ikut tergeser) */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-neutral-500">
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
        {/* Toggle radius kerja 7 km dari rumah sales (on/off) */}
        {homePoints.length > 0 && (
          <button
            type="button"
            onClick={() => setShowRadius((v) => !v)}
            className={`ml-auto shrink-0 rounded-full border border-dashed px-2.5 py-1 font-medium transition ${
              showRadius
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-400 text-neutral-500 hover:bg-neutral-100"
            }`}
          >
            Radius sales ({homePoints.length})
          </button>
        )}
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
