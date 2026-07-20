"use client";

import { useActionState } from "react";
import { Target, CheckCircle2, ChevronDown } from "lucide-react";
import { setKpiTargets } from "@/app/actions/config";
import { PendingLabel } from "@/components/SubmitButton";
import {
  KPI_COMPONENTS,
  TARGET_LEVELS,
  LEVELS,
  type KpiTargets,
} from "@/lib/sales-kpi-grade";

const UNIT_SUFFIX: Record<string, string> = {
  rp: "Rp",
  pct: "%",
  count: "konter",
  day: "hari",
};

// Admin set target KPI PER LEVEL (Lv 2/3/4). Sales naik ke sebuah level
// kalau MEMENUHI SEMUA target level itu. Makin tinggi level, target makin
// berat. Kolom = level, baris = komponen KPI.
export function KpiTargetForm({
  targets,
}: {
  targets: Record<number, KpiTargets>;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await setKpiTargets(fd)) ?? null,
    null,
  );

  return (
    // Dropdown: default tertutup (tidak langsung munculin tabel), buka saat
    // diketuk. ug-acc = animasi buka/tutup halus (globals.css).
    <details className="ug-acc group rounded-2xl border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <Target className="h-4 w-4 shrink-0 text-neutral-500" />
        <h2 className="font-semibold">Target KPI Sales · per Level</h2>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
      </summary>
      <form action={formAction} className="border-t border-neutral-200 p-5 pt-4">
        <p className="mb-3 text-xs text-neutral-400">
          Sales naik ke sebuah level kalau <b>memenuhi semua target</b> level
          itu. Level 1 (Trainee) titik awal tanpa syarat. Atur target tiap KPI
          untuk Lv 2–4 di bawah.
        </p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left">
              <th className="py-2 pr-3 text-xs font-semibold text-neutral-500">
                KPI
              </th>
              {TARGET_LEVELS.map((L) => {
                const info = LEVELS.find((l) => l.level === L)!;
                return (
                  <th
                    key={L}
                    className="px-2 py-2 text-xs font-semibold text-neutral-700"
                  >
                    Lv. {L} · {info.name}{" "}
                    <span className="font-normal text-neutral-400">
                      (Grade {info.grade})
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {KPI_COMPONENTS.map((c) => (
              <tr key={c.key} className="border-b border-neutral-100">
                <td className="py-2 pr-3 text-xs font-medium text-neutral-600">
                  {c.label}
                  <span className="ml-1 text-neutral-400">
                    ({UNIT_SUFFIX[c.unit]})
                  </span>
                </td>
                {TARGET_LEVELS.map((L) => (
                  <td key={L} className="px-2 py-1.5">
                    <input
                      name={`L${L}_${c.key}`}
                      type="number"
                      min={1}
                      required
                      defaultValue={targets[L]?.[c.key]}
                      className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-sm outline-none focus:border-neutral-900"
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {state && "ok" in state && state.ok && (
        <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-dark">
          <CheckCircle2 className="h-4 w-4" />
          Target tersimpan — level sales dihitung ulang.
        </p>
      )}
      {state && "error" in state && state.error && (
        <p className="mt-3 text-sm font-medium text-red-600">{state.error}</p>
      )}

      <button
        disabled={pending}
        className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Target"}
      </button>
      </form>
    </details>
  );
}
