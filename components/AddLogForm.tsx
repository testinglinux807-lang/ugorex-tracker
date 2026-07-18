"use client";

import { useActionState } from "react";
import { addStageLog } from "@/app/actions/tracker";
import { PendingLabel } from "@/components/SubmitButton";
import {
  STAGES,
  STAGE_LABEL,
  RESULTS,
  RESULT_LABEL,
  type Stage,
} from "@/lib/constants";

export function AddLogForm({
  prospectId,
  currentStage,
}: {
  prospectId: string;
  currentStage: string;
}) {
  const action = addStageLog.bind(null, prospectId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => {
      return (await action(fd)) ?? null;
    },
    null,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
    >
      <div>
        <h2 className="font-semibold">Ubah Tahap / Tambah Update</h2>
        <p className="text-xs text-neutral-400">
          Pilih tahap baru (Awareness → Star Seller) untuk memindahkan prospek
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Tahap (pindahkan ke)
          </label>
          <select
            name="stage"
            defaultValue={currentStage as Stage}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Hasil
          </label>
          <select
            name="result"
            defaultValue="NEUTRAL"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
          >
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Catatan <span className="text-neutral-900">*</span>
        </label>
        <textarea
          name="note"
          required
          rows={3}
          placeholder="Mis. Ditawarkan ke owner, langsung ditolak karena sudah ada supplier."
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Jumlah / stok (unit)
        </label>
        <input
          name="quantity"
          type="number"
          min={0}
          defaultValue={0}
          className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        />
      </div>

      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Update"}
      </button>
    </form>
  );
}
