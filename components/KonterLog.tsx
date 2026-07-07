"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { StageBadge, ResultBadge } from "@/components/Badge";
import { ChevronLeft, ChevronRight, ShoppingCart } from "lucide-react";

// Satu baris log konter: riwayat penting (funnel) atau penjualan.
export type LogItem = {
  id: string;
  kind: "FUNNEL" | "SALE";
  href: string;
  title: string;
  subtitle: string;
  by: string;
  date: string;
  stage?: string;
  result?: string;
};

const PER_PAGE = 6;
type Filter = "ALL" | "FUNNEL" | "SALE";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "ALL", label: "Semua" },
  { key: "FUNNEL", label: "Riwayat Penting" },
  { key: "SALE", label: "Penjualan" },
];

export function KonterLog({ items }: { items: LogItem[] }) {
  const [filter, setFilter] = useState<Filter>("ALL");
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () => (filter === "ALL" ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  if (items.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada log.</p>;
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PER_PAGE;
  const view = filtered.slice(start, start + PER_PAGE);

  return (
    <div className="flex h-full flex-1 flex-col">
      <div className="mb-3 flex flex-wrap gap-1.5 border-b border-neutral-100 pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => {
              setFilter(f.key);
              setPage(0);
            }}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              filter === f.key
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <ul className="flex-1 space-y-3">
        {view.length === 0 ? (
          <p className="text-sm text-neutral-400">
            Tidak ada data untuk filter ini.
          </p>
        ) : (
          view.map((a) => (
            <li key={a.id} className="flex items-start gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <Link href={a.href} className="font-medium hover:underline">
                  {a.title}
                </Link>
                <p className="truncate text-neutral-500">{a.subtitle}</p>
                <p className="mt-0.5 text-xs text-neutral-400">
                  {a.by} · {a.date}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {a.kind === "SALE" ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand-dark">
                    <ShoppingCart className="h-3 w-3" />
                    Penjualan
                  </span>
                ) : (
                  <>
                    {a.stage && <StageBadge stage={a.stage} />}
                    {a.result && <ResultBadge result={a.result} />}
                  </>
                )}
              </div>
            </li>
          ))
        )}
      </ul>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-xs text-neutral-400">
            {start + 1}–{Math.min(start + PER_PAGE, filtered.length)} dari{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
              aria-label="Sebelumnya"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-xs text-neutral-500">
              {safePage + 1}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
              aria-label="Berikutnya"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
