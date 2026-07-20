"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Satu baris = satu KODE mold (barang fisik). Owner belanja per kode; tiap
// kode punya daftar tipe HP yang kompatibel (models) sebagai penjelasan.
export type RestockCode = {
  code: string; // "AA10" — key & yang ditampilkan
  repId: string; // productId perwakilan yang dikirim ke server
  type: string; // "Antigores Spy" / "Antigores Clear"
  models: string[]; // tipe HP yang cocok, mis. ["iPhone 17", "iPhone 16 Pro"]
  price: number;
  central: number; // stok pusat yang bisa di-order (dibagi sekode)
};

// Dropdown pilih KODE mold (bukan per model HP) — dipakai di checkout restok
// owner. Cari pakai kode, jenis, atau tipe HP mana pun yang kompatibel.
export function CodePicker({
  codes,
  onPick,
}: {
  codes: RestockCode[];
  onPick: (code: string) => void; // kode yang dipilih (key)
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!term) return codes;
    return codes.filter((c) =>
      `${c.code} ${c.type} ${c.models.join(" ")}`.toLowerCase().includes(term),
    );
  }, [codes, term]);

  function pick(code: string) {
    onPick(code);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-400"
      >
        <span>— Pilih kode barang —</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute inset-x-0 z-20 mt-1 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="relative border-b border-neutral-100 p-2">
            <Search className="absolute left-4.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Cari kode / tipe HP (mis. iPhone 17, AA10)…"
              className="w-full rounded-lg border border-neutral-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-72 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-400">
                Kode tidak ditemukan.
              </li>
            ) : (
              shown.map((c) => (
                <li key={c.code}>
                  <button
                    type="button"
                    onClick={() => pick(c.code)}
                    disabled={c.central <= 0}
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-neutral-100 disabled:opacity-50"
                  >
                    <span className="flex items-center gap-1.5">
                      <span className="rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                        {c.code}
                      </span>
                      <span className="text-sm font-medium">{c.type}</span>
                      <span className="ml-auto text-xs text-neutral-500">
                        {rupiah(c.price)}
                      </span>
                    </span>
                    <span className="text-[11px] leading-snug text-neutral-500">
                      Cocok {c.models.length} tipe HP:{" "}
                      {c.models.map((m, i) => (
                        <span key={i}>
                          {i > 0 && ", "}
                          {/* tipe HP yang cocok dgn pencarian di-mark lime */}
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
                    </span>
                    <span
                      className={`text-[10px] ${
                        c.central <= 0
                          ? "text-red-500"
                          : c.central <= 10
                            ? "font-semibold text-amber-600"
                            : "text-neutral-400"
                      }`}
                    >
                      {c.central <= 0
                        ? "Stok pusat habis"
                        : `Stok pusat ${c.central}`}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
