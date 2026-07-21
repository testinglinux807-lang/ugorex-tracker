"use client";

import { useActionState } from "react";
import { XCircle } from "lucide-react";
import { cancelOrder } from "@/app/actions/requests";
import { SubmitButton } from "@/components/SubmitButton";

// Tombol batalkan order di kartu /order — dilipat dalam <details> supaya
// tidak kepencet tidak sengaja: klik pertama membuka konfirmasi + alasan
// (opsional), baru "Ya, Batalkan" yang mengeksekusi. Sukses → kartu
// re-render jadi status Dibatalkan (revalidate), form ini hilang sendiri.
export function CancelOrderForm({
  requestId,
  warnPaid = false,
}: {
  requestId: string;
  warnPaid?: boolean; // order sudah lunas — ingatkan refund manual
}) {
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, fd: FormData) =>
      cancelOrder(requestId, fd),
    null,
  );

  return (
    // open:col-span-full — di footer grid OrderCard: tombol tertutup ngisi
    // 1 sel, form terbuka melebar selebar kartu (2 kolom HP / 4 desktop)
    <details className="w-full open:col-span-full">
      <summary className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 [&::-webkit-details-marker]:hidden">
        <XCircle className="h-3.5 w-3.5" />
        Batalkan Order
      </summary>
      <form
        action={formAction}
        className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-2.5"
      >
        <p className="text-xs font-semibold text-red-700">
          Yakin batalkan order ini? Stok yang sudah dipesan akan dikembalikan
          ke stok pusat.
        </p>
        {warnPaid && (
          <p className="text-[11px] text-red-600">
            Order ini SUDAH DIBAYAR - pengembalian dananya harus diurus manual
            (dashboard Midtrans / kesepakatan dengan owner).
          </p>
        )}
        <textarea
          name="reason"
          rows={2}
          placeholder="Alasan pembatalan (opsional)"
          className="w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs focus:border-red-400 focus:outline-none"
        />
        {state?.error && (
          <p className="text-xs font-medium text-red-700">{state.error}</p>
        )}
        <SubmitButton
          pendingText="Membatalkan…"
          overlayText="Membatalkan order…"
          className="w-full rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          Ya, Batalkan Order
        </SubmitButton>
      </form>
    </details>
  );
}
