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
      <div className="-mx-1 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setActive(t.key)}
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.label}
              <span
                className={`ml-1 font-semibold ${
                  on
                    ? "text-neutral-900"
                    : t.count > 0
                      ? "text-neutral-500"
                      : "text-neutral-400"
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
