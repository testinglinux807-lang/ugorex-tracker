"use client";

import { useMemo, useState } from "react";
import { KatalogCard } from "@/components/KatalogCard";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const PER_PAGE = 20;

type Product = {
  id: string;
  name: string;
  price: number;
  description: string | null;
  imageUrl: string | null;
  central: number;
};
type Store = { id: string; name: string; area: string | null };

export function KatalogGrid({
  products,
  stores,
}: {
  products: Product[];
  stores: Store[];
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(term) ||
        (p.description ?? "").toLowerCase().includes(term),
    );
  }, [products, q]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Cari barang…"
          className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
        />
      </div>

      <p className="text-xs text-neutral-400">{filtered.length} barang</p>

      {view.length === 0 ? (
        <p className="py-4 text-sm text-neutral-400">Barang tidak ditemukan.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {view.map((p) => (
            <KatalogCard key={p.id} product={p} stores={stores} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            Hal {safePage + 1}/{pageCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
