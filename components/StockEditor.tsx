"use client";

import { useActionState, useMemo, useState } from "react";
import { adjustStock, setOwnerPrice } from "@/app/actions/pos";
import { Pencil, X, Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Spinner } from "@/components/SubmitButton";

const PER_PAGE = 15;

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

type StockProduct = {
  id: string;
  name: string;
  remaining: number;
  price: number;
  isCustomPrice: boolean;
};

function StockRow({ product }: { product: StockProduct }) {
  const [editing, setEditing] = useState(false);
  const [stockState, stockAction, stockPending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await adjustStock(fd)) ?? null,
    null,
  );
  const [priceState, priceAction, pricePending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await setOwnerPrice(fd)) ?? null,
    null,
  );

  // Tutup panel setelah harga / koreksi tersimpan (reset saat render)
  const [seenStock, setSeenStock] = useState(stockState);
  if (stockState !== seenStock) {
    setSeenStock(stockState);
    if (stockState?.ok) setEditing(false);
  }
  const [seenPrice, setSeenPrice] = useState(priceState);
  if (priceState !== seenPrice) {
    setSeenPrice(priceState);
    if (priceState?.ok) setEditing(false);
  }

  return (
    <div className="border-b border-dashed border-neutral-200 py-2 last:border-b-0">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          {/* Nama penuh, boleh 2 baris — tidak dipotong */}
          <p className="text-sm font-medium leading-snug">{product.name}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            {product.remaining > 0 && product.remaining <= 5 && (
              <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                Menipis
              </span>
            )}
            <span className="text-neutral-500">
              Sisa:{" "}
              <span
                className={`font-semibold ${
                  product.remaining === 0
                    ? "text-neutral-400"
                    : product.remaining <= 5
                      ? "text-amber-600"
                      : "text-neutral-900"
                }`}
              >
                {product.remaining}
              </span>
            </span>
            <span className="text-neutral-500">
              Harga:{" "}
              <span className="font-semibold text-neutral-900">
                {rupiah(product.price)}
              </span>
              {!product.isCustomPrice && (
                <span className="text-neutral-400"> (default)</span>
              )}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
          title={editing ? "Batal" : "Atur harga / koreksi stok"}
        >
          {editing ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <Pencil className="h-3.5 w-3.5" />
          )}
        </button>
      </div>

      {editing && (
        <div className="mt-2 space-y-2.5">
          {/* Harga jual — dipakai prefill saat catat penjualan di POS */}
          <form action={priceAction} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Harga jual
            </p>
            <input type="hidden" name="productId" value={product.id} />
            <div className="flex gap-1.5">
              <div className="relative w-32 shrink-0">
                <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                  Rp
                </span>
                <input
                  name="price"
                  type="number"
                  min={0}
                  defaultValue={product.price}
                  required
                  aria-label={`Harga jual ${product.name}`}
                  className="w-full rounded-lg border border-neutral-300 py-1.5 pl-7 pr-2 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={pricePending}
                className="shrink-0 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
              >
                {pricePending ? <Spinner className="h-3 w-3" /> : "Simpan Harga"}
              </button>
            </div>
            {priceState?.error && (
              <p className="text-xs font-medium text-red-600">
                {priceState.error}
              </p>
            )}
          </form>

          {/* Koreksi sisa stok fisik */}
          <form action={stockAction} className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Koreksi sisa stok
            </p>
            <input type="hidden" name="productId" value={product.id} />
            <div className="flex gap-1.5">
              <input
                name="remaining"
                type="number"
                min={0}
                defaultValue={product.remaining}
                required
                aria-label={`Sisa stok ${product.name}`}
                className="w-24 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <input
                name="note"
                placeholder="Alasan (mis. stok fisik beda)"
                className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
              />
              <button
                type="submit"
                disabled={stockPending}
                className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                {stockPending ? <Spinner className="h-3 w-3" /> : "Simpan"}
              </button>
            </div>
            {stockState?.error && (
              <p className="text-xs font-medium text-red-600">
                {stockState.error}
              </p>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

export function StockEditor({ products }: { products: StockProduct[] }) {
  const [q, setQ] = useState("");
  // Default: barang yang ADA di toko saja — daftar katalog lengkap (ratusan
  // barang bersisa 0) cuma bikin owner mengubek pagination.
  const [onlyStocked, setOnlyStocked] = useState(true);
  const [page, setPage] = useState(0);

  const stockedCount = useMemo(
    () => products.filter((p) => p.remaining > 0).length,
    [products],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        (!term || p.name.toLowerCase().includes(term)) &&
        (!onlyStocked || p.remaining > 0),
    );
  }, [products, q, onlyStocked]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );

  if (products.length === 0) {
    return (
      <p className="text-sm text-neutral-400">Belum ada barang di katalog.</p>
    );
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
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setOnlyStocked(true);
              setPage(0);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              onlyStocked
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Di Toko ({stockedCount})
          </button>
          <button
            type="button"
            onClick={() => {
              setOnlyStocked(false);
              setPage(0);
            }}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
              !onlyStocked
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            Semua ({products.length})
          </button>
        </div>
      </div>

      <p className="text-xs text-neutral-400">
        {filtered.length} barang
        {onlyStocked ? " di toko" : " (termasuk katalog tanpa stok)"}
        {q.trim() ? ` cocok dengan "${q.trim()}"` : ""}
      </p>

      {view.length === 0 ? (
        <p className="px-1 py-2 text-sm text-neutral-400">
          {onlyStocked && stockedCount === 0 && !q.trim()
            ? "Belum ada barang di toko — order restok lewat menu Order."
            : "Barang tidak ditemukan."}
        </p>
      ) : (
        // Gaya nota: baris teks tipis dipisah garis putus-putus, bukan
        // kotak per barang — hemat tempat & nama barang tidak terpotong.
        <div className="border-t border-dashed border-neutral-300">
          {view.map((p) => (
            <StockRow key={p.id} product={p} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between pt-1">
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
