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
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {TABS.map((t) => {
          const on = tab === t.key;
          const n = countOf(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  on
                    ? "bg-brand text-neutral-900"
                    : "bg-neutral-100 text-neutral-500"
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
