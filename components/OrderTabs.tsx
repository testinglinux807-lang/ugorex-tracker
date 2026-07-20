"use client";

import { useState, type ReactNode } from "react";
import { ShoppingCart, History } from "lucide-react";

// Halaman Order owner: di HP form checkout & riwayat dipisah tab biar
// tidak jadi satu scroll panjang; di desktop (lg+) tetap dua kolom.
export function OrderTabs({
  checkout,
  history,
  historyCount,
  defaultTab = "checkout",
}: {
  checkout: ReactNode;
  history: ReactNode;
  historyCount: number;
  defaultTab?: "checkout" | "history"; // "history" saat datang dari notifikasi
}) {
  const [tab, setTab] = useState<"checkout" | "history">(defaultTab);

  const tabCls = (active: boolean) =>
    `-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "border-neutral-900 text-neutral-900"
        : "border-transparent text-neutral-500 hover:text-neutral-800"
    }`;

  return (
    <div>
      {/* Dua tab (Buat Order / Riwayat) — gaya garis-bawah, sama seperti tab
          lain. Satu panel aktif tampil penuh, tak lagi dua kolom di desktop. */}
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setTab("checkout")}
          className={tabCls(tab === "checkout")}
        >
          <ShoppingCart className="h-4 w-4" />
          Buat Order
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={tabCls(tab === "history")}
        >
          <History className="h-4 w-4" />
          Riwayat
          {historyCount > 0 && (
            <span
              className={`font-semibold ${
                tab === "history" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              {historyCount}
            </span>
          )}
        </button>
      </div>

      {tab === "checkout" ? checkout : history}
    </div>
  );
}
