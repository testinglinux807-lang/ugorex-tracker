"use client";

import { useState, type ReactNode } from "react";
import { MessageSquarePlus, Inbox } from "lucide-react";

// Halaman Feedback owner: form kirim & riwayat dipisah tab (gaya sama
// dengan OrderTabs) biar tidak jadi satu scroll panjang di HP.
export function FeedbackTabs({
  form,
  riwayat,
  riwayatCount,
}: {
  form: ReactNode;
  riwayat: ReactNode;
  riwayatCount: number;
}) {
  const [tab, setTab] = useState<"form" | "riwayat">("form");

  const tabCls = (active: boolean) =>
    `-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
      active
        ? "border-neutral-900 text-neutral-900"
        : "border-transparent text-neutral-500 hover:text-neutral-800"
    }`;

  return (
    <div>
      <div className="-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <button
          type="button"
          onClick={() => setTab("form")}
          className={tabCls(tab === "form")}
        >
          <MessageSquarePlus className="h-4 w-4" />
          Kirim Feedback
        </button>
        <button
          type="button"
          onClick={() => setTab("riwayat")}
          className={tabCls(tab === "riwayat")}
        >
          <Inbox className="h-4 w-4" />
          Riwayat
          {riwayatCount > 0 && (
            <span
              className={`font-semibold ${
                tab === "riwayat" ? "text-neutral-900" : "text-neutral-400"
              }`}
            >
              {riwayatCount}
            </span>
          )}
        </button>
      </div>

      {tab === "form" ? form : riwayat}
    </div>
  );
}
