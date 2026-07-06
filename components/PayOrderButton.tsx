"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getOrderPaymentInfo } from "@/app/actions/requests";
import { CreditCard } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";
import {
  PaymentInstructionPanel,
  type PaymentInfo,
} from "@/components/PaymentInstructionPanel";

// Tombol "Bayar" di kartu riwayat order owner — untuk order UNPAID (selain
// CASH) yang belum diselesaikan. Membuka ulang instruksi pembayaran yang
// sama (VA/QRIS/GoPay/Kartu), regenerasi otomatis kalau sudah kedaluwarsa.
export function PayOrderButton({
  orderId,
  grandTotal,
}: {
  orderId: string;
  grandTotal: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<PaymentInfo | null>(null);
  const router = useRouter();

  async function handlePay() {
    setPending(true);
    setError(null);
    const res = await getOrderPaymentInfo(orderId);
    setPending(false);
    if (!res || "error" in res) {
      setError(res?.error ?? "Gagal memulai pembayaran.");
      return;
    }
    // Ternyata sudah lunas di Midtrans — server sudah menandai PAID.
    if ("paid" in res) {
      router.refresh();
      return;
    }
    setInfo({
      requestId: orderId,
      paymentMethod: res.paymentMethod,
      grandTotal: res.grandTotal ?? grandTotal,
      vaNumber: res.vaNumber,
      vaBank: res.vaBank,
      qrUrl: res.qrUrl,
      deeplink: res.deeplink,
      paymentExpiry: res.paymentExpiry,
    });
  }

  return (
    <>
      {error && (
        <span className="self-center text-xs font-medium text-red-600">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={handlePay}
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? (
          <PendingLabel text="Memproses…" />
        ) : (
          <>
            <CreditCard className="h-3.5 w-3.5" />
            Bayar Sekarang
          </>
        )}
      </button>
      {info && (
        <PaymentInstructionPanel info={info} onClose={() => setInfo(null)} />
      )}
    </>
  );
}
