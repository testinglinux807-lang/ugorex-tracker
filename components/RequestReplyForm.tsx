"use client";

import { useActionState, useState } from "react";
import { MessageSquareReply } from "lucide-react";
import { respondRequest } from "@/app/actions/requests";
import { PendingLabel } from "@/components/SubmitButton";

// Form balasan di kartu request (sales pemegang toko / admin). Balasan
// tampil di kartu untuk semua yang bisa lihat request-nya, dan pembuat
// request dapat notifikasi isi balasan (in-app + WA + push).
export function RequestReplyForm({
  requestId,
  hasResponse,
}: {
  requestId: string;
  hasResponse: boolean;
}) {
  const [open, setOpen] = useState(false);
  const action = respondRequest.bind(null, requestId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  // Sukses → tutup form (reset saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state && "ok" in state && state.ok) setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
      >
        <MessageSquareReply className="h-3.5 w-3.5" />
        {hasResponse ? "Ubah Balasan" : "Balas"}
      </button>
    );
  }

  return (
    <form action={formAction} className="w-full space-y-2">
      <textarea
        name="response"
        required
        rows={2}
        autoFocus
        placeholder="Tulis balasan untuk pembuat request…"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />
      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
        >
          Batal
        </button>
        <button
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <PendingLabel text="Mengirim…" /> : "Kirim Balasan"}
        </button>
      </div>
    </form>
  );
}
