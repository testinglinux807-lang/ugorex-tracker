"use client";

import Link from "next/link";
import { Trophy, AlertTriangle, Store } from "lucide-react";
import { Paginated } from "@/components/Paginated";
import { rupiahShort } from "@/lib/format";

// Evaluasi satu sales dari performa konter yang jadi tanggung jawabnya.
export type SalesEval = {
  salesId: string | null;
  name: string;
  konterCount: number;
  revenue: number;
  loyalCount: number;
  actionCount: number;
  terbengkalaiCount: number;
  best: { storeId: string; name: string; revenue: number } | null;
  worst: { storeId: string; name: string; days: number | null } | null;
};

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-center">
      <p className="text-sm font-bold text-neutral-800">{value}</p>
      <p className="text-[10px] text-neutral-400">{label}</p>
    </div>
  );
}

export function SalesEvaluation({ sales }: { sales: SalesEval[] }) {
  const rows = sales.map((s, i) => (
    <div
      key={s.salesId ?? "none"}
      className="rounded-xl border border-neutral-200 bg-white p-4"
    >
      <div className="flex items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-neutral-900 text-xs font-bold text-white">
          {i + 1}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{s.name}</p>
          <p className="flex items-center gap-1 text-xs text-neutral-400">
            <Store className="h-3 w-3" /> {s.konterCount} konter
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-bold text-brand-dark">{rupiahShort(s.revenue)}</p>
          <p className="text-[10px] text-neutral-400">total omzet</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Loyal" value={s.loyalCount} />
        <Stat label="Action" value={s.actionCount} />
        <Stat label="Terbengkalai" value={s.terbengkalaiCount} />
      </div>

      {(s.best || s.worst) && (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {s.best && (
            <Link
              href={`/konter/${s.best.storeId}`}
              className="flex items-center gap-2 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs hover:bg-neutral-50"
            >
              <Trophy className="h-3.5 w-3.5 shrink-0 text-brand-dark" />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-neutral-400">Terbaik: </span>
                {s.best.name}
              </span>
              <span className="shrink-0 font-semibold text-neutral-700">
                {rupiahShort(s.best.revenue)}
              </span>
            </Link>
          )}
          {s.worst && (
            <Link
              href={`/konter/${s.worst.storeId}`}
              className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs hover:bg-amber-100"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 truncate">
                <span className="text-amber-700/70">Perlu perhatian: </span>
                {s.worst.name}
              </span>
              <span className="shrink-0 font-semibold text-amber-700">
                {s.worst.days == null ? "belum aktif" : `${s.worst.days}hr`}
              </span>
            </Link>
          )}
        </div>
      )}
    </div>
  ));

  return (
    <Paginated
      perPage={6}
      className="space-y-3"
      empty={
        <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
          <p className="text-neutral-500">Belum ada data sales.</p>
        </div>
      }
      items={rows}
    />
  );
}
