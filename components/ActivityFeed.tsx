"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { StageBadge, ResultBadge } from "@/components/Badge";
import { ChevronLeft, ChevronRight, ShoppingCart, AlertCircle, MessageSquare } from "lucide-react";

export type Activity = {
  id: string;
  type: "FUNNEL" | "SALE" | "PROBLEM" | "REQUEST";
  href: string;
  title: string;
  subtitle: string;
  by: string;
  date: string;
  stage?: string;
  result?: string;
  status?: string;
};

const PER_PAGE = 5;

type FilterType = "ALL" | "SALE" | "PROBLEM" | "REQUEST" | "FUNNEL";

export function ActivityFeed({ activities }: { activities: Activity[] }) {
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState<FilterType>("ALL");

  const filteredActivities = useMemo(() => {
    if (filter === "ALL") return activities;
    return activities.filter(a => a.type === filter);
  }, [activities, filter]);

  if (activities.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada aktivitas.</p>;
  }

  const pageCount = Math.max(1, Math.ceil(filteredActivities.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PER_PAGE;
  const items = filteredActivities.slice(start, start + PER_PAGE);

  return (
    <div className="flex flex-1 flex-col h-full">
      <div className="mb-3 flex flex-wrap gap-1.5 border-b border-neutral-100 pb-3">
        {(["ALL", "SALE", "PROBLEM", "REQUEST", "FUNNEL"] as FilterType[]).map((f) => (
          <button
            key={f}
            onClick={() => { setFilter(f); setPage(0); }}
            className={`px-2 py-1 text-[10px] font-bold rounded-full border transition-colors ${
              filter === f 
                ? "bg-neutral-900 border-neutral-900 text-white" 
                : "border-neutral-200 text-neutral-500 hover:bg-neutral-50"
            }`}
          >
            {f === "ALL" ? "SEMUA" : f === "SALE" ? "PENJUALAN" : f === "REQUEST" ? "FEEDBACK" : f === "FUNNEL" ? "AKTIVITAS" : f}
          </button>
        ))}
      </div>

      <ul className="flex-1 space-y-3">
        {filteredActivities.length === 0 && (
          <p className="text-sm text-neutral-400">Tidak ada data untuk filter ini.</p>
        )}
        {items.map((a) => (
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
              {a.type === "SALE" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-brand bg-brand/10 px-2 py-0.5 text-xs font-medium text-brand">
                  <ShoppingCart className="h-3 w-3" />
                  Penjualan
                </span>
              ) : a.type === "PROBLEM" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-red-500 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                  <AlertCircle className="h-3 w-3" />
                  Problem
                </span>
              ) : a.type === "REQUEST" ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-blue-500 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                  <MessageSquare className="h-3 w-3" />
                  Feedback
                </span>
              ) : (
                <>
                  {a.stage && <StageBadge stage={a.stage} />}
                  {a.result && <ResultBadge result={a.result} />}
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {pageCount > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-xs text-neutral-400">
            {start + 1}–{Math.min(start + PER_PAGE, filteredActivities.length)} dari{" "}
            {filteredActivities.length}
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
