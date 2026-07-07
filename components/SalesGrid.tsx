"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Trophy, ArrowUpRight } from "lucide-react";
import { rupiahShort } from "@/lib/format";

export type SalesRowData = {
  id: string;
  name: string;
  phone: string;
  konter: number;
  revenue: number;
  loyal: number;
  terbengkalai: number;
  taskDone: number;
  taskTotal: number;
};

function Stat({
  label,
  value,
  warn,
}: {
  label: string;
  value: string | number;
  warn?: boolean;
}) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2 py-1.5 text-center">
      <p
        className={`text-sm font-bold ${warn ? "text-amber-600" : "text-neutral-800"}`}
      >
        {value}
      </p>
      <p className="text-[10px] text-neutral-400">{label}</p>
    </div>
  );
}

export function SalesGrid({ rows }: { rows: SalesRowData[] }) {
  const [q, setQ] = useState("");

  // Peringkat dari urutan penuh (bukan hasil filter) biar tetap konsisten
  const ranked = useMemo(() => rows.map((r, i) => ({ ...r, rank: i + 1 })), [
    rows,
  ]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return ranked;
    return ranked.filter((r) =>
      `${r.name} ${r.phone}`.toLowerCase().includes(term),
    );
  }, [ranked, q]);

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Cari sales (nama / no HP)…"
          className="w-full rounded-lg border border-neutral-300 py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-500"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          Tidak ada sales yang cocok.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/sales/${r.id}`}
              className="group rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition hover:border-neutral-400"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold">
                    {r.rank === 1 && (
                      <Trophy className="h-4 w-4 shrink-0 text-brand-dark" />
                    )}
                    <span className="truncate">{r.name}</span>
                  </p>
                  <p className="text-xs text-neutral-400">{r.phone}</p>
                </div>
                <span className="flex shrink-0 items-center gap-1">
                  <span className="text-xs font-medium text-neutral-400">
                    #{r.rank}
                  </span>
                  <ArrowUpRight className="h-4 w-4 text-neutral-300 group-hover:text-neutral-600" />
                </span>
              </div>

              <div className="mt-3 rounded-xl bg-neutral-900 p-3 text-white">
                <p className="text-xs text-neutral-400">Omzet</p>
                <p className="text-xl font-bold text-brand">
                  {r.revenue > 0 ? rupiahShort(r.revenue) : "—"}
                </p>
              </div>

              <div className="mt-3 grid grid-cols-4 gap-2">
                <Stat label="Konter" value={r.konter} />
                <Stat label="Loyal" value={r.loyal} />
                <Stat
                  label="Terbengkalai"
                  value={r.terbengkalai}
                  warn={r.terbengkalai > 0}
                />
                <Stat label="Tugas" value={`${r.taskDone}/${r.taskTotal}`} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
