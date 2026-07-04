"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Dropdown barang dengan pencarian (untuk katalog ratusan barang).
// Nilai terpilih dikirim lewat hidden input name="productId".
export function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: { id: string; name: string; price: number; remaining: number }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  // Tutup panel saat klik di luar / tekan Escape
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

  const picked = products.find((p) => p.id === value);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return products;
    return products.filter((p) => p.name.toLowerCase().includes(term));
  }, [products, q]);

  function pick(id: string) {
    onChange(id);
    setOpen(false);
    setQ("");
  }

  return (
    <div ref={wrapRef} className="relative">
      <input type="hidden" name="productId" value={value} />
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm"
      >
        <span className={`truncate ${picked ? "" : "text-neutral-400"}`}>
          {picked
            ? `${picked.name} — ${rupiah(picked.price)}`
            : "— Pilih barang —"}
        </span>
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
              placeholder="Cari barang…"
              className="w-full rounded-lg border border-neutral-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-400">
                Barang tidak ditemukan.
              </li>
            ) : (
              filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => pick(p.id)}
                    className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                      p.id === value ? "bg-neutral-50 font-medium" : ""
                    }`}
                  >
                    <span className="min-w-0 truncate">
                      {p.name}
                      <span className="ml-1.5 text-xs text-neutral-400">
                        {rupiah(p.price)}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span
                        className={`text-xs ${
                          p.remaining === 0
                            ? "text-neutral-300"
                            : "text-neutral-500"
                        }`}
                      >
                        sisa {p.remaining}
                      </span>
                      {p.id === value && (
                        <Check className="h-3.5 w-3.5 text-neutral-900" />
                      )}
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
