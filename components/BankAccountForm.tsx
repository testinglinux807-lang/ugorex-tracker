"use client";

import { useActionState } from "react";
import { setSalesBankAccount } from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";

// Form admin di detail sales: catat no. rekening (teks bebas, mis. "BCA
// 1234567890 a.n. Budi Santoso") — dipakai admin waktu transfer komisi.
export function BankAccountForm({
  salesId,
  currentBankAccount,
}: {
  salesId: string;
  currentBankAccount: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await setSalesBankAccount(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <input type="hidden" name="salesId" value={salesId} />
      <div className="flex items-center gap-2">
        <input
          name="bankAccount"
          defaultValue={currentBankAccount ?? ""}
          placeholder="mis. BCA 1234567890 a.n. Budi Santoso"
          className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
        />
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
          No. rekening tersimpan.
        </p>
      )}
    </form>
  );
}
