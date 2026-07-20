"use client";

import { useState, type ReactNode } from "react";
import { Paginated } from "@/components/Paginated";

const TABS = [
  { key: "all", label: "Semua" },
  { key: "top", label: "Terlaris" },
  { key: "unvisited", label: "Belum Dikunjungi" },
  { key: "low", label: "Stok Menipis" },
] as const;

// Daftar kartu konter (halaman Konter Saya) dengan filter kerja sales:
// mana yang belum dikunjungi, mana yang stoknya menipis, mana yang terlaris
// (diurutkan revenue tertinggi) — plus pagination supaya HP tidak merender
// puluhan kartu tinggi sekaligus.
export function KonterFilter({
  items,
}: {
  items: { visited: boolean; low: boolean; revenue: number; node: ReactNode }[];
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("all");

  const match = (i: (typeof items)[number]) =>
    tab === "unvisited" ? !i.visited : tab === "low" ? i.low : true;
  // Tab "top": hanya konter yang sudah pernah jualan, diurutkan terbesar
  // dulu — biar kelihatan mana yang benar-benar terlaris.
  const view =
    tab === "top"
      ? [...items].filter((i) => i.revenue > 0).sort((a, b) => b.revenue - a.revenue)
      : items.filter(match);
  const countOf = (key: string) =>
    key === "unvisited"
      ? items.filter((i) => !i.visited).length
      : key === "low"
        ? items.filter((i) => i.low).length
        : key === "top"
          ? items.filter((i) => i.revenue > 0).length
          : items.length;

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const on = tab === t.key;
          const n = countOf(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.label}
              <span
                className={`ml-1 font-semibold ${
                  on ? "text-neutral-900" : "text-neutral-400"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* key={tab}: reset ke halaman 1 tiap ganti filter */}
      <Paginated
        key={tab}
        perPage={6}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3"
        empty={
          <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-500">
            {tab === "unvisited"
              ? "Semua konter sudah dikunjungi."
              : tab === "low"
                ? "Tidak ada konter dengan stok menipis."
                : tab === "top"
                  ? "Belum ada konter dengan penjualan."
                  : "Belum ada konter."}
          </div>
        }
        items={view.map((i) => i.node)}
      />
    </div>
  );
}
