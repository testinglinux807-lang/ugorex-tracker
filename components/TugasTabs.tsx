"use client";

import { useState, type ReactNode } from "react";

// Tab inbox halaman Tugas: tiap tab = jenis kerjaan beda, badge angka =
// beban kerja tanpa perlu buka detail (pola counter WhatsApp/email).
export function TugasTabs({
  tabs,
  sections,
}: {
  tabs: { key: string; label: string; count: number }[];
  sections: { tab: string; node: ReactNode }[];
}) {
  // Buka tab pertama yang ada isinya biar langsung ke kerjaan
  const first = tabs.find((t) => t.count > 0)?.key ?? tabs[0]?.key ?? "";
  const [active, setActive] = useState(first);

  return (
    <div className="space-y-4">
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {t.label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                  t.count > 0
                    ? on
                      ? "bg-brand text-neutral-900"
                      : "bg-neutral-900 text-white"
                    : on
                      ? "bg-neutral-700 text-neutral-300"
                      : "bg-neutral-100 text-neutral-400"
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {sections
        .filter((s) => s.tab === active)
        .map((s, i) => (
          <div key={i}>{s.node}</div>
        ))}
    </div>
  );
}
