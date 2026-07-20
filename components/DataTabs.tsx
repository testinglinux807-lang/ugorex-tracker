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
      {/* Tab garis-bawah (bisa digeser horizontal di mobile), bukan pill —
          konsisten dgn tab /order & filter peta. */}
      <div
        className={`-mx-1 mb-4 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
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
              className={`-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              {t.label}
              {t.count !== undefined && (
                <span
                  className={`ml-1 font-semibold ${
                    on ? "text-neutral-900" : "text-neutral-400"
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
