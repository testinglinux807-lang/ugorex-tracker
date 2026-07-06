"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncOrderPayment, getOrderPaidStatus } from "@/app/actions/requests";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { Copy, Check, X, PackageCheck } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export type PaymentInfo = {
  requestId: string;
  paymentMethod: string;
  grandTotal: number;
  vaNumber?: string | null;
  vaBank?: string | null;
  qrUrl?: string | null;
  deeplink?: string | null;
  paymentExpiry?: string | null;
  redirectUrl?: string | null; // 3DS kartu
};

// Panel instruksi pembayaran ala Tokopedia/Shopee — dirender di halaman kita
// sendiri (bukan redirect ke Midtrans). Polling status tiap ~4 detik selagi
// terbuka, kartu memicu challenge 3DS lewat popup kecil Midtrans (satu-
// satunya bagian yang masih "keluar" dari halaman kita, tapi tanpa navigasi
// penuh — beda dari Snap yang dulu redirect seluruh halaman di HP).
export function PaymentInstructionPanel({
  info,
  onClose,
}: {
  info: PaymentInfo;
  onClose: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  const attempts = useRef(0);
  const cardTriggered = useRef(false);

  useEffect(() => {
    if (info.paymentMethod === "CASH" || paid) return;
    const interval = setInterval(async () => {
      attempts.current += 1;
      await syncOrderPayment(info.requestId);
      const isPaid = await getOrderPaidStatus(info.requestId);
      if (isPaid) {
        setPaid(true);
        clearInterval(interval);
        router.refresh();
      } else if (attempts.current >= 75) {
        clearInterval(interval); // ~5 menit (75 x 4 detik)
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [info.requestId, info.paymentMethod, paid, router]);

  // Kartu: picu challenge 3DS sekali saat panel muncul
  useEffect(() => {
    if (
      info.paymentMethod !== "CARD" ||
      !info.redirectUrl ||
      cardTriggered.current
    )
      return;
    cardTriggered.current = true;
    window.MidtransNew3ds?.authenticate(info.redirectUrl, {
      performAuthentication: true,
      onSuccess: () => {
        syncOrderPayment(info.requestId).then(() => {
          setPaid(true);
          router.refresh();
        });
      },
    });
  }, [info.paymentMethod, info.redirectUrl, info.requestId, router]);

  function copyVa() {
    if (!info.vaNumber) return;
    navigator.clipboard.writeText(info.vaNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const isMobile =
    typeof window !== "undefined" &&
    window.matchMedia("(max-width: 768px)").matches;
  const label = PAYMENT_METHOD_LABEL[info.paymentMethod] ?? info.paymentMethod;

  return (
    <div
      className="animate-ugfade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="animate-ugscalein w-80 max-w-full space-y-3 rounded-2xl bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="font-semibold">{label}</p>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
            aria-label="Tutup"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {paid ? (
          <div className="flex flex-col items-center gap-2 py-4 text-center">
            <PackageCheck className="h-10 w-10 text-brand-dark" />
            <p className="font-semibold">Pembayaran lunas!</p>
          </div>
        ) : info.paymentMethod === "CASH" ? (
          <p className="text-sm text-neutral-600">
            Order dibuat. Bayar cash langsung ke sales saat barang sampai.
          </p>
        ) : (
          <>
            <div>
              <p className="text-xs text-neutral-500">Total Bayar</p>
              <p className="text-xl font-extrabold text-brand-dark">
                {rupiah(info.grandTotal)}
              </p>
            </div>

            {info.vaNumber && (
              <div className="space-y-1 rounded-lg bg-neutral-100 p-3">
                <p className="text-[11px] uppercase text-neutral-500">
                  {info.vaBank}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-mono text-lg font-bold tracking-wide">
                    {info.vaNumber}
                  </p>
                  <button
                    type="button"
                    onClick={copyVa}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-neutral-300 bg-white px-2 py-1 text-xs font-medium hover:bg-neutral-50"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    {copied ? "Tersalin" : "Salin"}
                  </button>
                </div>
              </div>
            )}

            {info.qrUrl && (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-neutral-100 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={info.qrUrl}
                  alt="QR pembayaran"
                  className="h-40 w-40 rounded-lg bg-white object-contain"
                />
                <p className="text-center text-xs text-neutral-500">
                  Scan pakai aplikasi{" "}
                  {info.paymentMethod === "GOPAY"
                    ? "Gojek / e-wallet"
                    : "m-banking / e-wallet"}{" "}
                  apa saja
                </p>
              </div>
            )}

            {info.deeplink && isMobile && (
              <a
                href={info.deeplink}
                className="block w-full rounded-lg bg-neutral-900 py-2 text-center text-sm font-semibold text-white hover:bg-neutral-800"
              >
                Buka Aplikasi Gojek
              </a>
            )}

            {info.paymentMethod === "CARD" && !info.redirectUrl && (
              <p className="text-sm text-neutral-500">Memproses kartu…</p>
            )}

            <p className="text-center text-xs text-neutral-400">
              Menunggu pembayaran — halaman ini update otomatis begitu lunas.
            </p>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
        >
          {paid ? "Tutup" : "Bayar Nanti"}
        </button>
      </div>
    </div>
  );
}
