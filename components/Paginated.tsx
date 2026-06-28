"use client";

import { useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Paginated({
  items,
  perPage = 5,
  className,
  empty,
}: {
  items: ReactNode[];
  perPage?: number;
  className?: string;
  empty?: ReactNode;
}) {
  const [page, setPage] = useState(0);

  if (items.length === 0) {
    return <>{empty ?? null}</>;
  }

  const pageCount = Math.ceil(items.length / perPage);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * perPage;
  const slice = items.slice(start, start + perPage);

  return (
    <div>
      <div className={className}>{slice}</div>
      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-xs text-neutral-400">
            {start + 1}–{Math.min(start + perPage, items.length)} dari{" "}
            {items.length}
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
