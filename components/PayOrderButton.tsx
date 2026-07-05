"use client";

import { useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import { getOrderPayToken, syncOrderPayment } from "@/app/actions/requests";
import { CreditCard } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";

// Popup pembayaran Midtrans Snap (deklarasi sama dengan RequestForm)
declare global {
  interface Window {
    snap?: {
      pay: (
        token: string,
        callbacks?: {
          onSuccess?: () => void;
          onPending?: () => void;
          onError?: () => void;
          onClose?: () => void;
        },
      ) => void;
    };
  }
}

const MIDTRANS_CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
const SNAP_URL =
  process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com/snap/snap.js"
    : "https://app.sandbox.midtrans.com/snap/snap.js";

// Tombol "Bayar" di kartu riwayat order owner — untuk order UNPAID yang
// popup pembayarannya keburu ditutup saat checkout.
export function PayOrderButton({ orderId }: { orderId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!MIDTRANS_CLIENT_KEY) return null;

  async function handlePay() {
    setPending(true);
    setError(null);
    const res = await getOrderPayToken(orderId);
    setPending(false);
    if (!res || "error" in res) {
      setError(res?.error ?? "Gagal memulai pembayaran.");
      return;
    }
    // Ternyata sudah lunas di Midtrans — server sudah menandai PAID,
    // tinggal refresh biar badge "Lunas" muncul.
    if ("paid" in res) {
      router.refresh();
      return;
    }
    // Di HP pakai halaman Snap full-page — popup iframe Snap sering tidak
    // bisa di-tap di browser HP, dan deeplink e-wallet diblokir dari iframe.
    if (
      res.snapRedirectUrl &&
      window.matchMedia("(max-width: 768px)").matches
    ) {
      window.location.assign(res.snapRedirectUrl);
      return;
    }
    // Setelah bayar, verifikasi + tandai lunas di server (webhook tidak
    // sampai ke localhost) baru refresh tampilan.
    const sync = () => syncOrderPayment(orderId).finally(() => router.refresh());
    window.snap?.pay(res.snapToken, {
      onSuccess: sync,
      onPending: sync,
      onClose: () => router.refresh(),
    });
  }

  return (
    <>
      <Script
        src={SNAP_URL}
        data-client-key={MIDTRANS_CLIENT_KEY}
        strategy="afterInteractive"
      />
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
    </>
  );
}
