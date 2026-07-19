"use client";

import { useState, type ReactNode } from "react";

// Bagian halaman dipisah tab di HP supaya tidak jadi satu scroll panjang
// yang membingungkan; di desktop (lg+) default-nya tab disembunyikan dan
// semua bagian tampil dalam grid. `alwaysTabs` = tab dipakai di desktop
// juga (per tab isinya grid sendiri) — dipakai /data yang seksi-seksinya
// beda tinggi jauh sehingga grid campur jadi berantakan.
export function DataTabs({
  tabs,
  sections,
  gridClassName = "items-start lg:grid-cols-2",
  alwaysTabs = false,
}: {
  tabs: { key: string; label: string; count?: number }[];
  sections: { tab: string; className?: string; node: ReactNode }[];
  gridClassName?: string; // kelas grid desktop, mis. "lg:grid-cols-3"
  alwaysTabs?: boolean;
}) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  return (
    <div>
      <div
        className={`mb-4 flex gap-1.5 overflow-x-auto pb-1 ${
          alwaysTabs ? "" : "lg:hidden"
        }`}
      >
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
              {t.count !== undefined && (
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    on
                      ? "bg-brand text-neutral-900"
                      : "bg-neutral-100 text-neutral-500"
                  }`}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div className={`grid grid-cols-1 gap-6 ${gridClassName}`}>
        {sections.map((s, i) => (
          <div
            key={i}
            className={`min-w-0 ${active === s.tab ? "" : "hidden"} ${
              alwaysTabs ? "" : "lg:block"
            } ${s.className ?? ""}`}
          >
            {s.node}
          </div>
        ))}
      </div>
    </div>
  );
}
