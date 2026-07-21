"use client";

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const PER_PAGE = 15;

const rupiah = (n: number) => "Rp" + n.toLocaleString("id-ID");

// Stok per KODE mold: barang sekode = barang fisik sama; models = tipe HP
// yang kompatibel (jadi detail "cocok dengan HP apa saja").
type StockCode = {
  code: string;
  type: string;
  models: string[];
  remaining: number;
  price: number;
  isCustomPrice: boolean;
};

// Baris stok read-only per kode — owner tidak bisa edit di sini. Selisih
// stok diajukan lewat Tiket Keluhan; harga jual tersimpan otomatis dari
// transaksi POS terakhir. `term` = kata kunci pencarian aktif → tipe HP
// yang cocok di-mark lime supaya owner langsung lihat HP-nya.
function StockRow({ code: c, term }: { code: StockCode; term: string }) {
  return (
    <div className="border-b border-dashed border-neutral-200 py-2 last:border-b-0">
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 text-sm font-medium leading-snug">
          <span className="rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
            {c.code}
          </span>
          {c.type}
        </p>
        {/* Detail kompatibilitas: semua tipe HP yang cocok untuk kode ini */}
        <p className="mt-0.5 break-words text-[11px] leading-snug text-neutral-500">
          Cocok {c.models.length} tipe HP:{" "}
          {c.models.map((m, i) => (
            <span key={i}>
              {i > 0 && ", "}
              <span
                className={
                  term && m.toLowerCase().includes(term)
                    ? "rounded bg-brand px-0.5 font-semibold text-neutral-900"
                    : ""
                }
              >
                {m}
              </span>
            </span>
          ))}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {c.remaining > 0 && c.remaining <= 5 && (
            <span className="rounded-full border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
              Menipis
            </span>
          )}
          <span className="text-neutral-500">
            Sisa:{" "}
            <span
              className={`font-semibold ${
                c.remaining === 0
                  ? "text-neutral-400"
                  : c.remaining <= 5
                    ? "text-amber-600"
                    : "text-neutral-900"
              }`}
            >
              {c.remaining}
            </span>
          </span>
          <span className="text-neutral-500">
            Harga:{" "}
            <span className="font-semibold text-neutral-900">
              {rupiah(c.price)}
            </span>
            {!c.isCustomPrice && (
              <span className="text-neutral-400"> (default)</span>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}

export function StockEditor({ codes }: { codes: StockCode[] }) {
  const [q, setQ] = useState("");
  // Default: kode yang ADA di toko saja — katalog lengkap (banyak kode
  // bersisa 0) cuma bikin owner mengubek pagination.
  const [onlyStocked, setOnlyStocked] = useState(true);
  const [page, setPage] = useState(0);

  const stockedCount = useMemo(
    () => codes.filter((c) => c.remaining > 0).length,
    [codes],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return codes.filter(
      (c) =>
        (!term ||
          `${c.code} ${c.type} ${c.models.join(" ")}`
            .toLowerCase()
            .includes(term)) &&
        (!onlyStocked || c.remaining > 0),
    );
  }, [codes, q, onlyStocked]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );

  if (codes.length === 0) {
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
            placeholder="Cari kode / tipe HP…"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
          />
        </div>
        <div className="-mx-1 flex shrink-0 gap-1 border-b border-neutral-200 px-1">
          <button
            type="button"
            onClick={() => {
              setOnlyStocked(true);
              setPage(0);
            }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              onlyStocked
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Di Toko{" "}
            <span
              className={`font-semibold ${onlyStocked ? "text-neutral-900" : "text-neutral-400"}`}
            >
              {stockedCount}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setOnlyStocked(false);
              setPage(0);
            }}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              !onlyStocked
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            Semua{" "}
            <span
              className={`font-semibold ${!onlyStocked ? "text-neutral-900" : "text-neutral-400"}`}
            >
              {codes.length}
            </span>
          </button>
        </div>
      </div>

      <p className="text-xs text-neutral-400">
        {filtered.length} kode
        {onlyStocked ? " di toko" : " (termasuk katalog tanpa stok)"}
        {q.trim() ? ` cocok dengan "${q.trim()}"` : ""}
      </p>

      {view.length === 0 ? (
        <p className="px-1 py-2 text-sm text-neutral-400">
          {onlyStocked && stockedCount === 0 && !q.trim()
            ? "Belum ada barang di toko - order restok lewat menu Order."
            : "Kode tidak ditemukan."}
        </p>
      ) : (
        // Gaya nota: baris teks tipis dipisah garis putus-putus, bukan
        // kotak per barang — hemat tempat & nama barang tidak terpotong.
        <div className="border-t border-dashed border-neutral-300">
          {view.map((c) => (
            <StockRow key={c.code} code={c} term={q.trim().toLowerCase()} />
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
