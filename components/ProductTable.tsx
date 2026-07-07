"use client";

import { useMemo, useState } from "react";
import { ProductRow } from "@/components/DataActions";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const PER_PAGE = 15;

type Product = {
  id: string;
  name: string;
  code: string | null;
  price: number;
  description: string | null;
  imageUrl: string | null;
  centralStock: number;
};

// Daftar barang menu Data: pencarian + pagination (katalog bisa ratusan item)
export function ProductTable({ products }: { products: Product[] }) {
  const [q, setQ] = useState("");
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!term ||
          p.name.toLowerCase().includes(term) ||
          (p.code ?? "").toLowerCase().includes(term) ||
          (p.description ?? "").toLowerCase().includes(term)) &&
        (!onlyEmpty || p.centralStock === 0),
    );
  }, [products, q, onlyEmpty]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );

  if (products.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada barang.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
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
        <button
          type="button"
          onClick={() => {
            setOnlyEmpty((v) => !v);
            setPage(0);
          }}
          className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium ${
            onlyEmpty
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          Stok pusat kosong
        </button>
      </div>

      <p className="text-xs text-neutral-400">
        {filtered.length} barang
        {onlyEmpty ? " dengan stok pusat kosong" : ""}
        {q.trim() ? ` cocok dengan "${q.trim()}"` : ""}
      </p>

      <div className="divide-y divide-neutral-100">
        {view.length === 0 ? (
          <p className="px-1 py-2 text-sm text-neutral-400">
            Barang tidak ditemukan.
          </p>
        ) : (
          view.map((p) => <ProductRow key={p.id} product={p} />)
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
          <span className="text-xs text-neutral-400">
            {safePage * PER_PAGE + 1}–
            {Math.min((safePage + 1) * PER_PAGE, filtered.length)} dari{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
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
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
