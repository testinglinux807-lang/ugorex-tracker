"use client";

import { useActionState, useState } from "react";
import { setMonthlyTarget } from "@/app/actions/config";
import { Pencil } from "lucide-react";

const rpShort = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}jt`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}rb`
      : `${n}`;

export function TargetCard({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(
    async (_p: unknown, fd: FormData) => (await setMonthlyTarget(fd)) ?? null,
    null,
  );
  const pct = target > 0 ? Math.min(100, Math.round((current / target) * 100)) : 0;

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 text-neutral-900">
      <div className="flex items-center justify-between">
        <p className="text-xs text-neutral-500">Target Bulanan</p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-neutral-400 hover:text-neutral-900"
          aria-label="Atur target"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      <p className="mt-1 truncate text-xl font-bold leading-tight text-brand">
        Rp {rpShort(current)}
      </p>
      <p className="truncate text-xs text-neutral-400">
        target Rp {rpShort(target)} · {pct}%
      </p>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-neutral-100">
        <div
          className="h-full rounded-full bg-brand"
          style={{ width: `${pct}%` }}
        />
      </div>

      {open && (
        <form action={formAction} className="mt-3 space-y-2">
          <input
            name="target"
            type="number"
            min={0}
            defaultValue={target}
            placeholder="Target (Rp)"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900"
          />
          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {pending ? "Menyimpan…" : "Simpan Target"}
          </button>
          {state?.ok && (
            <p className="text-xs text-neutral-500">Target tersimpan.</p>
          )}
          {state?.error && (
            <p className="text-xs text-red-600">{state.error}</p>
          )}
        </form>
      )}
    </div>
  );
}
