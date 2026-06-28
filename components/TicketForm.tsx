"use client";

import { useActionState } from "react";
import { createTicket } from "@/app/actions/tickets";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export function TicketForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createTicket(fd)) ?? null,
    null,
  );

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5"
    >
      <h2 className="font-semibold">Buat Tiket Keluhan</h2>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Judul <span className="text-neutral-900">*</span>
        </label>
        <input
          name="subject"
          required
          placeholder="Mis. Barang datang rusak"
          className={inputCls}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Isi keluhan <span className="text-neutral-900">*</span>
        </label>
        <textarea
          name="message"
          required
          rows={3}
          placeholder="Jelaskan keluhannya…"
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
          Tiket terkirim.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Mengirim…" : "Kirim Tiket"}
      </button>
    </form>
  );
}
