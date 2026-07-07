"use client";

import { useActionState } from "react";
import { createTask } from "@/app/actions/tasks";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Form admin: beri tugas manual ke salah satu sales.
export function TaskAssignForm({
  salesList,
  stores,
}: {
  salesList: { id: string; name: string }[];
  stores: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createTask(fd)) ?? null,
    null,
  );

  if (salesList.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Belum ada akun sales untuk diberi tugas.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      <select name="assignedToId" required defaultValue="" className={inputCls}>
        <option value="" disabled>
          — Pilih sales —
        </option>
        {salesList.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <input
        name="title"
        required
        placeholder="Judul tugas (mis. Follow up Konter A)"
        className={inputCls}
      />
      <textarea
        name="note"
        rows={2}
        placeholder="Catatan (opsional)"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <select name="priority" defaultValue="NORMAL" className={inputCls}>
          <option value="NORMAL">Prioritas biasa</option>
          <option value="HIGH">Penting</option>
        </select>
        <input name="dueDate" type="date" className={inputCls} />
      </div>
      <select name="storeId" defaultValue="" className={inputCls}>
        <option value="">— Tanpa konter —</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {state?.error && (
        <p className="text-xs font-medium text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Tugas terkirim ke sales.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Mengirim…" /> : "Beri Tugas"}
      </button>
    </form>
  );
}
