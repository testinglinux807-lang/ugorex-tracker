"use client";

import { useActionState } from "react";
import { setSalesCaptain } from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";

// Form admin di detail sales: angkat sales jadi Sales Captain (level 5,
// rahasia) untuk satu wilayah. Kosongkan wilayah lalu simpan = mencabut.
export function CaptainForm({
  salesId,
  currentArea,
}: {
  salesId: string;
  currentArea: string | null;
}) {
  const action = setSalesCaptain.bind(null, salesId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-1.5">
      <div className="flex items-center gap-2">
        <input
          name="captainArea"
          type="text"
          defaultValue={currentArea ?? ""}
          placeholder="Wilayah, mis. Karawang Barat"
          className="w-full flex-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm"
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
          Perubahan captain tersimpan.
        </p>
      )}
    </form>
  );
}
