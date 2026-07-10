"use client";

import { useActionState } from "react";
import { setSalesCommission } from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";

// Form admin di detail sales: atur persen komisi affiliator (dari omzet
// konter yang dipegang sales ini). Boleh desimal, mis. 2,5.
export function CommissionForm({
  salesId,
  currentPct,
}: {
  salesId: string;
  currentPct: number;
}) {
  const action = setSalesCommission.bind(null, salesId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            name="commissionPct"
            type="number"
            min={0}
            max={100}
            step={0.1}
            defaultValue={currentPct}
            className="w-full rounded-lg border border-neutral-300 py-1.5 pl-3 pr-7 text-sm"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
            %
          </span>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="shrink-0 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <PendingLabel text="…" /> : "Simpan"}
        </button>
      </div>
      {state?.error && (
        <p className="text-xs font-medium text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs font-medium text-neutral-600">
          Komisi tersimpan.
        </p>
      )}
    </form>
  );
}
