"use client";

import { useState, type ReactNode } from "react";
import { Paginated } from "@/components/Paginated";

// Daftar order dengan filter status (dipakai admin/sales & riwayat owner)
// — order yang sudah sampai tinggal buka tab "Sampai" tanpa mengubek
// pagination. Label mengikuti badge di kartu order.
const TABS = [
  { key: "ALL", label: "Semua" },
  { key: "SHIPPED", label: "Dikirim" },
  { key: "PENDING", label: "Menunggu" },
  { key: "COMPLETED", label: "Sampai" },
] as const;

export function OrderList({
  items,
  emptyAll = "Belum ada orderan restok dari toko.",
}: {
  items: { status: string; node: ReactNode }[];
  emptyAll?: string;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("ALL");
  const view = tab === "ALL" ? items : items.filter((i) => i.status === tab);
  const countOf = (key: string) =>
    key === "ALL"
      ? items.length
      : items.filter((i) => i.status === key).length;

  return (
    <div className="space-y-3">
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

      {/* key={tab}: reset ke halaman 1 tiap ganti filter */}
      <Paginated
        key={tab}
        perPage={5}
        className="space-y-3"
        empty={
          <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
            {tab === "ALL"
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
