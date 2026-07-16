"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Batas baris yang dirender di panel (katalog per-model bisa >1000 item)
const MAX_ROWS = 150;

// Tier kompatibilitas di awal description ("PAS SEMPURNA · mold ZH 5")
function tierOf(search?: string | null): string | null {
  if (!search) return null;
  for (const t of ["PAS SEMPURNA", "KOMPATIBEL DGN CATATAN", "KOMPATIBEL"]) {
    if (search.startsWith(t)) return t;
  }
  return null;
}

const TIER_CLS: Record<string, string> = {
  "PAS SEMPURNA": "border-brand-dark text-brand-dark",
  KOMPATIBEL: "border-neutral-400 text-neutral-600",
  "KOMPATIBEL DGN CATATAN": "border-neutral-300 text-neutral-400",
};

// Dropdown barang dengan pencarian. Satu produk = satu model HP; barang
// kompatibel berbagi `code` (kode mold, mis. AA44). Pencarian membaca
// nama/kode + `search` (description: tier & kode mold), dan hasilnya
// ditambah "teman satu kode" — cari "Infinix Zero 5G" juga memunculkan
// model lain yang cocok dengan mold AA44 yang sama.
// Nilai terpilih dikirim lewat hidden input name="productId".
export function ProductPicker({
  products,
  value,
  onChange,
}: {
  products: {
    id: string;
    name: string;
    code?: string | null;
    price: number;
    remaining: number;
    search?: string | null;
  }[];
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
  const term = q.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return products.map((p) => ({ p, mate: false }));
    const direct = products.filter(
      (p) =>
        `${p.name} ${p.code ?? ""}`.toLowerCase().includes(term) ||
        (p.search ?? "").toLowerCase().includes(term),
    );
    const hit = new Set(direct.map((p) => p.id));
    const codes = new Set(direct.map((p) => p.code).filter(Boolean));
    // Barang lain yang sekode dengan hasil pencarian = barang fisik yang
    // sama, cuma beda model HP — ditampilkan setelah hasil langsung.
    const mates = products.filter(
      (p) => p.code && codes.has(p.code) && !hit.has(p.id),
    );
    return [
      ...direct.map((p) => ({ p, mate: false })),
      ...mates.map((p) => ({ p, mate: true })),
    ];
  }, [products, term]);

  const shown = filtered.slice(0, MAX_ROWS);
  const firstMateIdx = shown.findIndex((f) => f.mate);

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
              placeholder="Cari tipe HP / nama / kode…"
              className="w-full rounded-lg border border-neutral-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            {shown.length === 0 ? (
              <li className="px-3 py-2 text-sm text-neutral-400">
                Barang tidak ditemukan.
              </li>
            ) : (
              shown.map(({ p, mate }, idx) => {
                const tier = tierOf(p.search);
                return (
                  <li key={p.id}>
                    {idx === firstMateIdx && (
                      <p className="border-y border-dashed border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-medium text-neutral-400">
                        Satu kode — cocok juga untuk model ini:
                      </p>
                    )}
                    <button
                      type="button"
                      onClick={() => pick(p.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                        p.id === value ? "bg-neutral-50 font-medium" : ""
                      }`}
                    >
                      <span className="min-w-0 break-words leading-snug">
                        {p.code && (
                          <span className="mr-1.5 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                            {p.code}
                          </span>
                        )}
                        {p.name}
                        <span className="ml-1.5 text-xs text-neutral-400">
                          {rupiah(p.price)}
                        </span>
                        {tier && (
                          <span
                            className={`ml-1.5 inline-block rounded border px-1 py-0.5 text-[10px] font-semibold ${TIER_CLS[tier]}`}
                          >
                            {tier}
                          </span>
                        )}
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
                );
              })
            )}
            {filtered.length > MAX_ROWS && (
              <li className="px-3 py-2 text-xs text-neutral-400">
                +{filtered.length - MAX_ROWS} barang lagi — ketik untuk
                mempersempit.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
