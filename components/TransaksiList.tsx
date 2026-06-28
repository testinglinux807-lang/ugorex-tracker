"use client";

import { useState } from "react";
import { X, Printer, ChevronLeft, ChevronRight } from "lucide-react";

const PER_PAGE = 5;

export type Trx = {
  id: string;
  productName: string;
  qty: number;
  price: number;
  total: number;
  createdAt: string | Date;
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export function TransaksiList({
  sales,
  storeName,
}: {
  sales: Trx[];
  storeName: string;
}) {
  const [sel, setSel] = useState<Trx | null>(null);
  const [page, setPage] = useState(0);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  if (sales.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada transaksi.</p>;
  }

  const filtered = sales.filter((s) => {
    const t = new Date(s.createdAt).getTime();
    if (from) {
      const f = new Date(from);
      f.setHours(0, 0, 0, 0);
      if (t < f.getTime()) return false;
    }
    if (to) {
      const e = new Date(to);
      e.setHours(23, 59, 59, 999);
      if (t > e.getTime()) return false;
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );

  const inputCls =
    "rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-700";

  return (
    <>
      {/* Filter tanggal */}
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-neutral-500">Tanggal:</span>
        <input
          type="date"
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(0);
          }}
          className={inputCls}
        />
        <span className="text-neutral-400">—</span>
        <input
          type="date"
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(0);
          }}
          className={inputCls}
        />
        {(from || to) && (
          <button
            type="button"
            onClick={() => {
              setFrom("");
              setTo("");
              setPage(0);
            }}
            className="text-neutral-400 underline hover:text-neutral-700"
          >
            Reset
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="py-2 text-sm text-neutral-400">
          Tidak ada transaksi pada rentang itu.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-100">
          {view.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setSel(s)}
              className="flex w-full items-center justify-between gap-2 py-2 text-left text-sm hover:bg-neutral-50"
            >
              <div className="min-w-0">
                <p className="truncate font-medium">{s.productName}</p>
                <p className="truncate text-xs text-neutral-400">
                  {s.qty} × {rupiah(s.price)} · {fmtDateTime(s.createdAt)}
                </p>
              </div>
              <span className="shrink-0 font-semibold">{rupiah(s.total)}</span>
            </button>
          </li>
          ))}
        </ul>
      )}

      {pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3">
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

      {/* Modal struk */}
      {sel && (
        <div
          className="animate-ugfade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSel(null)}
        >
          <div
            className="animate-ugscalein w-72 max-w-full rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div id="struk-print">
              {/* Header */}
              <div className="text-center">
                <p className="text-lg font-extrabold tracking-tight">UGOREX</p>
                <p className="text-sm font-medium">{storeName}</p>
                <p className="text-[11px] text-neutral-400">Struk Penjualan</p>
              </div>

              <div className="my-3 border-t border-dashed border-neutral-300" />

              <div className="space-y-1 text-xs text-neutral-500">
                <div className="flex justify-between">
                  <span>No. Transaksi</span>
                  <span className="font-mono text-neutral-700">
                    #{sel.id.slice(-8).toUpperCase()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Waktu</span>
                  <span className="text-neutral-700">
                    {fmtDateTime(sel.createdAt)}
                  </span>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-neutral-300" />

              {/* Item */}
              <div className="text-sm">
                <p className="font-medium">{sel.productName}</p>
                <div className="mt-1 flex justify-between text-neutral-500">
                  <span>
                    {sel.qty} × {rupiah(sel.price)}
                  </span>
                  <span className="text-neutral-800">{rupiah(sel.total)}</span>
                </div>
              </div>

              <div className="my-3 border-t border-dashed border-neutral-300" />

              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">TOTAL</span>
                <span className="text-xl font-extrabold text-brand">
                  {rupiah(sel.total)}
                </span>
              </div>

              <p className="mt-4 text-center text-[11px] text-neutral-400">
                Terima kasih atas pembelian Anda
              </p>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setSel(null)}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                <X className="h-4 w-4" /> Tutup
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                <Printer className="h-4 w-4" /> Cetak
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
