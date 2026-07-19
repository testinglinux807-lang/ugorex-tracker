"use client";

import { useActionState } from "react";
import { setStoreSales } from "@/app/actions/tracker";
import { PendingLabel } from "@/components/SubmitButton";

// Form ringkas di kartu /konter (admin): pasang / ganti / lepas sales
// penanggung jawab konter. Pilihan kosong = konter tanpa sales.
export function StoreSalesForm({
  storeId,
  currentSalesId,
  salesOptions,
}: {
  storeId: string;
  currentSalesId: string | null;
  salesOptions: { id: string; name: string }[];
}) {
  const action = setStoreSales.bind(null, storeId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <select
        name="salesId"
        defaultValue={currentSalesId ?? ""}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      >
        <option value="">— Tanpa sales —</option>
        {salesOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Sales konter disimpan.
        </p>
      )}

      <button
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Sales"}
      </button>
    </form>
  );
}
