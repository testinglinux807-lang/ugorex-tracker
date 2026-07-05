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
    `flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors ${
      active ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"
    }`;

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-1 rounded-xl border border-neutral-200 bg-white p-1 lg:hidden">
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
              className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                tab === "history"
                  ? "bg-brand text-neutral-900"
                  : "bg-neutral-200 text-neutral-600"
              }`}
            >
              {historyCount}
            </span>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <div className={`${tab === "checkout" ? "" : "hidden"} lg:block`}>
          {checkout}
        </div>
        <div className={`${tab === "history" ? "" : "hidden"} lg:block`}>
          {history}
        </div>
      </div>
    </div>
  );
}
