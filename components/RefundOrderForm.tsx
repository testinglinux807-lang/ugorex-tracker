"use client";

import { useActionState } from "react";
import { Banknote } from "lucide-react";
import { markOrderRefunded } from "@/app/actions/requests";
import { SubmitButton } from "@/components/SubmitButton";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Admin menandai dana order batal sudah dikembalikan (refund uangnya sendiri
// manual: dashboard Midtrans / transfer / tunai via sales). Dilipat dalam
// <details> ala CancelOrderForm; open:col-span-2 utk footer grid OrderCard.
export function RefundOrderForm({
  requestId,
  amount,
}: {
  requestId: string;
  amount: number; // total + fee yang dulu dibayar owner
}) {
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, fd: FormData) =>
      markOrderRefunded(requestId, fd),
    null,
  );

  return (
    <details className="w-full open:col-span-full">
      <summary className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90 [&::-webkit-details-marker]:hidden">
        <Banknote className="h-3.5 w-3.5" />
        Tandai Dana Dikembalikan
      </summary>
      <form
        action={formAction}
        className="mt-2 space-y-2 rounded-lg border border-neutral-200 bg-white p-2.5"
      >
        <p className="text-xs font-semibold text-neutral-700">
          Dana {rupiah(amount)} sudah dikembalikan ke owner? Owner akan
          dikabari (notifikasi + WA).
        </p>
        <textarea
          name="note"
          rows={2}
          placeholder="Cara pengembalian (mis. transfer BCA / tunai via sales)…"
          className="w-full rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs focus:border-neutral-900 focus:outline-none"
        />
        {state?.error && (
          <p className="text-xs font-medium text-red-600">{state.error}</p>
        )}
        <SubmitButton
          pendingText="Menyimpan…"
          overlayText="Menandai refund…"
          className="w-full rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          Ya, Dana Sudah Dikembalikan
        </SubmitButton>
      </form>
    </details>
  );
}
