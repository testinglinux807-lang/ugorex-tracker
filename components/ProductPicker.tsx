"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, Check, ShoppingBag } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Batas baris yang dirender di panel (katalog per-model bisa >1000 item)
const MAX_ROWS = 150;

type PickerProduct = {
  id: string;
  name: string;
  code?: string | null;
  price: number;
  remaining: number;
  search?: string | null;
};

// Baris panel: item barang atau pembatas grup
type Row =
  | { kind: "item"; p: PickerProduct }
  | { kind: "sep"; label: string };

// Label mold dari description ("PAS SEMPURNA · mold ZH 5 · ...")
function moldOf(search?: string | null): string | null {
  const m = /mold ([^·]+)/.exec(search ?? "");
  return m ? m[1].trim() : null;
}

// Dropdown barang dengan pencarian. Satu produk = satu model HP; barang
// kompatibel berbagi `code` (kode mold, mis. AA44) = barang fisik yang sama.
// Tanpa kata kunci: daftar dikelompokkan per kode dengan pembatas, biar
// kelihatan mana yang satu kode. Dengan kata kunci: hasil langsung dulu,
// lalu pembatas "satu kode" berisi model lain yang berbagi mold yang sama —
// cari "Infinix Zero 5G" ikut memunculkan semua model se-AA44.
// Nilai terpilih dikirim lewat hidden input name="productId".
export function ProductPicker({
  products,
  value,
  onChange,
  notFoundHref,
  notFoundCta,
}: {
  products: PickerProduct[];
  value: string;
  onChange: (id: string) => void;
  // Kalau diisi: waktu pencarian tidak ketemu, tampilkan ajakan order barang
  // itu (bukan sekadar "tidak ditemukan") — link ke halaman order/restok.
  notFoundHref?: string;
  notFoundCta?: string;
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

  const rows = useMemo<Row[]>(() => {
    if (!term) {
      // Browsing: kelompokkan per kode, pembatas per grup
      const groups = new Map<string, PickerProduct[]>();
      for (const p of products) {
        const key = p.code ?? "Tanpa kode";
        (groups.get(key) ?? groups.set(key, []).get(key)!).push(p);
      }
      const out: Row[] = [];
      for (const key of [...groups.keys()].sort()) {
        const items = groups.get(key)!;
        const mold = moldOf(items[0]?.search);
        out.push({
          kind: "sep",
          label: `${key}${mold ? ` · mold ${mold}` : ""} - ${items.length} model`,
        });
        for (const p of items) out.push({ kind: "item", p });
      }
      return out;
    }

    const direct = products.filter(
      (p) =>
        `${p.name} ${p.code ?? ""}`.toLowerCase().includes(term) ||
        (p.search ?? "").toLowerCase().includes(term),
    );
    const hit = new Set(direct.map((p) => p.id));
    const codes = new Set(direct.map((p) => p.code).filter(Boolean));
    // Barang lain sekode dengan hasil pencarian = barang fisik yang sama,
    // cuma beda model HP — ditampilkan setelah pembatas.
    const mates = products.filter(
      (p) => p.code && codes.has(p.code) && !hit.has(p.id),
    );
    const out: Row[] = direct.map((p) => ({ kind: "item", p }));
    if (mates.length > 0) {
      out.push({ kind: "sep", label: "Satu kode - cocok juga untuk model ini:" });
      for (const p of mates) out.push({ kind: "item", p });
    }
    return out;
  }, [products, term]);

  const shown = rows.slice(0, MAX_ROWS);

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
            ? `${picked.name} - ${rupiah(picked.price)}`
            : "- Pilih barang -"}
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
              <li className="px-3 py-3">
                <p className="text-sm text-neutral-500">
                  {term ? (
                    <>
                      Belum ada di stok tokomu buat kata kunci “{q}”.
                    </>
                  ) : (
                    "Barang tidak ditemukan."
                  )}
                </p>
                {term && notFoundHref && (
                  <Link
                    href={notFoundHref}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90"
                  >
                    <ShoppingBag className="h-3.5 w-3.5" />
                    {notFoundCta ?? "Order barang ini sekarang"}
                  </Link>
                )}
              </li>
            ) : (
              shown.map((row, idx) =>
                row.kind === "sep" ? (
                  <li key={`sep-${idx}`}>
                    <p className="border-y border-dashed border-neutral-200 bg-neutral-50 px-3 py-1 text-[11px] font-medium text-neutral-400">
                      {row.label}
                    </p>
                  </li>
                ) : (
                  <li key={row.p.id}>
                    <button
                      type="button"
                      onClick={() => pick(row.p.id)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100 ${
                        row.p.id === value ? "bg-neutral-50 font-medium" : ""
                      }`}
                    >
                      <span className="min-w-0 break-words leading-snug">
                        {row.p.code && (
                          <span className="mr-1.5 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                            {row.p.code}
                          </span>
                        )}
                        {row.p.name}
                        <span className="ml-1.5 text-xs text-neutral-400">
                          {rupiah(row.p.price)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span
                          className={`text-xs ${
                            row.p.remaining === 0
                              ? "text-neutral-300"
                              : "text-neutral-500"
                          }`}
                        >
                          sisa {row.p.remaining}
                        </span>
                        {row.p.id === value && (
                          <Check className="h-3.5 w-3.5 text-neutral-900" />
                        )}
                      </span>
                    </button>
                  </li>
                ),
              )
            )}
            {rows.length > MAX_ROWS && (
              <li className="px-3 py-2 text-xs text-neutral-400">
                +{rows.length - MAX_ROWS} baris lagi - ketik untuk
                mempersempit.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
