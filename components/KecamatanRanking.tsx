"use client";

import { useState } from "react";
import { interestTier, INTEREST_TIERS, type KecStat } from "@/lib/geo";
import { Trophy, ChevronLeft, ChevronRight } from "lucide-react";

const PER_PAGE = 5;

export function KecamatanRanking({ ranking }: { ranking: KecStat[] }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.ceil(ranking.length / PER_PAGE);
  const start = page * PER_PAGE;
  const items = ranking.slice(start, start + PER_PAGE);

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Trophy className="h-4 w-4" />
        <h2 className="font-semibold">Ranking Kecamatan — Paling Potensial</h2>
      </div>
      <p className="mb-2 text-xs text-neutral-400">
        Diurut dari rasio konter tertarik tertinggi · format{" "}
        <span className="text-green-600">tertarik</span>/
        <span className="text-red-600">tidak</span>/netral
      </p>
      <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1">
        {INTEREST_TIERS.map((t) => (
          <span
            key={t.label}
            className="flex items-center gap-1 text-[11px] text-neutral-500"
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: t.color }}
            />
            {t.label}
          </span>
        ))}
      </div>

      {ranking.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Belum ada data konter di kecamatan mana pun.
        </p>
      ) : (
        <>
          <ol className="space-y-3">
            {items.map((k, i) => {
              const rank = start + i + 1;
              const pct = Math.round(k.score * 100);
              const tier = interestTier(k.score);
              return (
                <li key={k.name} className="flex items-center gap-3">
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-neutral-400">
                    {rank}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{k.name}</span>
                        <span
                          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold text-white"
                          style={{ backgroundColor: tier.color }}
                        >
                          {tier.label}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-neutral-500">
                        <span className="font-semibold text-green-600">
                          {k.pos}
                        </span>
                        /
                        <span className="font-semibold text-red-600">
                          {k.neg}
                        </span>
                        {k.neu ? `/${k.neu}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: tier.color,
                          }}
                        />
                      </div>
                      <span className="w-10 shrink-0 text-right text-xs font-semibold">
                        {pct}%
                      </span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          {pageCount > 1 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
              <span className="text-xs text-neutral-400">
                {start + 1}–{Math.min(start + PER_PAGE, ranking.length)} dari{" "}
                {ranking.length} kecamatan
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                  aria-label="Sebelumnya"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="px-1 text-xs text-neutral-500">
                  {page + 1}/{pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  disabled={page >= pageCount - 1}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                  aria-label="Berikutnya"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
