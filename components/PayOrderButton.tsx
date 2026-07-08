"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getOrderPaymentInfo } from "@/app/actions/requests";
import { CreditCard } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";
import {
  PaymentInstructionPanel,
  type PaymentInfo,
} from "@/components/PaymentInstructionPanel";

// Order yang panel pembayarannya sedang terbuka — disimpan supaya kalau tab
// ke-unload (mis. tap deeplink GoPay lalu balik dari app Gojek), panelnya
// bisa dibuka lagi otomatis & polling lanjut. Dibersihkan saat lunas/ditutup.
const PENDING_PAY_KEY = "ugorex_pending_pay";

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

  const clearPending = useCallback(() => {
    if (typeof window !== "undefined") localStorage.removeItem(PENDING_PAY_KEY);
  }, []);

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
      clearPending();
      router.refresh();
      return;
    }
    // Tandai order ini "sedang dibayar" sebelum panel muncul (owner mungkin
    // langsung tap deeplink GoPay yang meng-unload tab ini).
    if (typeof window !== "undefined")
      localStorage.setItem(PENDING_PAY_KEY, orderId);
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

  // Buka lagi panel otomatis kalau order inilah yang tadi sedang dibayar —
  // menangani kasus tab remount penuh setelah balik dari app pembayaran.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (localStorage.getItem(PENDING_PAY_KEY) !== orderId) return;
    // Defer keluar dari body effect supaya tak memicu setState sinkron.
    const t = setTimeout(() => handlePay(), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    clearPending();
    setInfo(null);
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
        <PaymentInstructionPanel
          info={info}
          onClose={handleClose}
          onPaid={clearPending}
        />
      )}
    </>
  );
}
