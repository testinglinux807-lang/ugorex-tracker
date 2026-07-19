"use client";

import { useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Paginated } from "@/components/Paginated";

// Daftar order dengan filter status (dipakai admin/sales & riwayat owner)
// — order yang sudah sampai tinggal buka tab "Sampai" tanpa mengubek
// pagination. Label mengikuti badge di kartu order.
const TABS = [
  { key: "ALL", label: "Semua" },
  { key: "PENDING", label: "Disiapkan" },
  { key: "READY", label: "Siap Pickup" },
  { key: "SHIPPED", label: "Dikirim" },
  { key: "COMPLETED", label: "Sampai" },
  { key: "RETURNED", label: "Retur" },
  { key: "CANCELLED", label: "Batal" },
] as const;

export function OrderList({
  items,
  emptyAll = "Belum ada orderan restok dari toko.",
}: {
  // search: teks yang bisa dicari dari order ini (resi, toko, barang, dst)
  items: { status: string; search?: string; node: ReactNode }[];
  emptyAll?: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("ALL");
  const [q, setQ] = useState("");
  const term = q.trim().toLowerCase();

  // Pencarian diterapkan dulu, baru tab — angka badge tab ikut hasil cari
  const matches = term
    ? items.filter((i) => (i.search ?? "").toLowerCase().includes(term))
    : items;
  const view = tab === "ALL" ? matches : matches.filter((i) => i.status === tab);
  const countOf = (key: string) =>
    key === "ALL"
      ? matches.length
      : matches.filter((i) => i.status === key).length;

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari no resi / order / toko / barang…"
          className="w-full rounded-xl border border-neutral-300 bg-white py-2 pl-9 pr-3 text-sm focus:border-neutral-900 focus:outline-none"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => {
          const active = tab === t.key;
          const n = countOf(t.key);
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                active
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  active
                    ? "bg-brand text-neutral-900"
                    : "bg-neutral-100 text-neutral-500"
                }`}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* key: reset ke halaman 1 tiap ganti filter / kata kunci */}
      <Paginated
        key={`${tab}-${term}`}
        perPage={5}
        className="space-y-3"
        empty={
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
            {term
              ? `Tidak ada order yang cocok dengan "${q.trim()}".`
              : tab === "ALL"
                ? emptyAll
                : `Tidak ada order berstatus ${
                    TABS.find((t) => t.key === tab)?.label ?? tab
                  }.`}
          </div>
        }
        items={view.map((i) => i.node)}
      />
    </div>
  );
}
