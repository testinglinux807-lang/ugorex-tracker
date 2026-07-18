"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ArrowUpRight } from "lucide-react";
import {
  STAGES,
  STAGE_LABEL,
  RESULT_LABEL,
  RESULT_COLOR,
  type Stage,
  type Result,
} from "@/lib/constants";

// Satu prospek di dalam sebuah tahap funnel — dipakai buat detail expand.
export type FunnelItem = {
  id: string;
  storeId: string;
  product: string;
  store: string;
  area: string;
  result: Result;
};

export function FunnelBar({
  counts,
  total,
  items,
}: {
  counts: Record<Stage, number>;
  total: number;
  // Kalau diisi, tiap tahap bisa diklik untuk buka daftar konter di tahap itu.
  // Kalau kosong (mis. di beranda), tampil seperti bar biasa tanpa interaksi.
  items?: Record<Stage, FunnelItem[]>;
}) {
  const [open, setOpen] = useState<Stage | null>(null);

  if (total === 0)
    return <p className="text-sm text-neutral-400">Belum ada data</p>;

  return (
    <div className="space-y-3">
      {STAGES.map((stage) => {
        const value = counts[stage] || 0;
        const pct = total ? Math.round((value / total) * 100) : 0;
        const list = items?.[stage] ?? [];
        const clickable = !!items && value > 0;
        const isOpen = open === stage;

        const row = (
          <div className="flex items-center gap-3 text-sm">
            {clickable && (
              <ChevronRight
                className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${
                  isOpen ? "rotate-90 text-neutral-700" : ""
                }`}
              />
            )}
            <span className="w-20 shrink-0 text-left text-neutral-500">
              {STAGE_LABEL[stage]}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-5 shrink-0 text-right font-bold text-neutral-800">
              {value}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-neutral-400">
              {pct}%
            </span>
          </div>
        );

        return (
          <div key={stage}>
            {clickable ? (
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : stage)}
                className="w-full rounded-lg px-1 py-0.5 hover:bg-neutral-50"
                aria-expanded={isOpen}
              >
                {row}
              </button>
            ) : (
              <div className="px-1 py-0.5">{row}</div>
            )}

            {clickable && isOpen && (
              <ul className="mt-1 space-y-1.5 border-l-2 border-neutral-100 pl-3 pb-1 pt-1 sm:ml-6">
                {list.map((it) => (
                  <li key={it.id}>
                    <Link
                      href={`/konter/${it.storeId}`}
                      className="group flex items-center justify-between gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-neutral-50"
                    >
                      <span className="min-w-0 truncate text-neutral-700">
                        <span className="font-medium">{it.product}</span>
                        <span className="text-neutral-400"> @ </span>
                        {it.store}
                        <span className="text-neutral-400"> · {it.area}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${RESULT_COLOR[it.result]}`}
                        >
                          {RESULT_LABEL[it.result]}
                        </span>
                        <ArrowUpRight className="h-3.5 w-3.5 text-neutral-300 group-hover:text-neutral-600" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
