"use client";

import { useActionState } from "react";
import { createRequest } from "@/app/actions/requests";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function RequestForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createRequest(fd)) ?? null,
    null,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5"
    >
      <h2 className="font-semibold">Ajukan Request</h2>
      <p className="text-xs text-neutral-400">
        Mis. minta restok barang, minta dikunjungi sales, dll.
      </p>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Judul <span className="text-neutral-900">*</span>
        </label>
        <input
          name="subject"
          required
          placeholder="Mis. Minta restok Softcase 50 pcs"
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Detail <span className="text-neutral-900">*</span>
        </label>
        <textarea
          name="message"
          required
          rows={3}
          placeholder="Jelaskan kebutuhanmu…"
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
          Request terkirim ke sales & admin.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Mengirim…" : "Kirim Request"}
      </button>
    </form>
  );
}
