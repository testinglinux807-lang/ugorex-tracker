"use client";

import { useActionState } from "react";
import { recordCommissionPayout } from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Form admin mencatat pencairan fee sales (di /sales/[id]). Jumlah default =
// saldo belum dicairkan, boleh diubah kalau dibayar sebagian.
export function PayoutForm({
  salesId,
  suggested,
}: {
  salesId: string;
  suggested: number;
}) {
  const action = recordCommissionPayout.bind(null, salesId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="amount"
          type="number"
          min={1}
          required
          defaultValue={suggested > 0 ? suggested : ""}
          placeholder="Jumlah (Rp)"
          className={inputCls}
        />
        <input
          name="note"
          placeholder="Catatan (mis. transfer BCA)"
          className={inputCls}
        />
      </div>

      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Pencairan tercatat — masuk buku kas &amp; sales dinotifikasi.
        </p>
      )}

      <button
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Catat Pencairan"}
      </button>
    </form>
  );
}
