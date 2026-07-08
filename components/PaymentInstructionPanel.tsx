"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { syncOrderPayment, getOrderPaidStatus } from "@/app/actions/requests";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { Spinner } from "@/components/SubmitButton";
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
  onPaid,
}: {
  info: PaymentInfo;
  onClose: () => void;
  onPaid?: () => void;
}) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [paid, setPaid] = useState(false);
  // QR di-fetch dari server Midtrans — sampai gambarnya ter-render, tutupi
  // area QR dengan animasi loading supaya tak terlihat kotak kosong sekejap.
  // qrMinTime: jaga spinner tampil minimal sesaat, karena kalau QR sudah
  // ter-cache onLoad bisa memicu instan (sebelum spinner sempat terlihat).
  const [qrLoaded, setQrLoaded] = useState(false);
  const [qrMinTime, setQrMinTime] = useState(false);
  // verifying: pembayaran baru terdeteksi lunas & halaman sedang di-refresh —
  // tutup QR dengan spinner ("memproses…") sebelum berganti ke kartu sukses.
  const [verifying, setVerifying] = useState(false);
  const paidTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!info.qrUrl) return;
    const t = setTimeout(() => setQrMinTime(true), 600);
    return () => clearTimeout(t);
  }, [info.qrUrl]);

  // Spinner menutup QR saat: gambar QR belum siap, ATAU pembayaran sudah masuk
  // dan sedang diproses (transisi ke status lunas).
  const showQrSpinner = !!info.qrUrl && (verifying || !(qrLoaded && qrMinTime));
  const attempts = useRef(0);
  const cardTriggered = useRef(false);

  useEffect(() => {
    if (info.paymentMethod === "CASH" || paid) return;
    const interval = setInterval(async () => {
      attempts.current += 1;
      await syncOrderPayment(info.requestId);
      const isPaid = await getOrderPaidStatus(info.requestId);
      if (isPaid) {
        onPaid?.();
        clearInterval(interval);
        // Tampilkan spinner di QR sesaat ("memproses"), baru munculkan kartu
        // sukses — supaya ada transisi loading yang terasa saat lunas.
        setVerifying(true);
        router.refresh();
        paidTimer.current = setTimeout(() => setPaid(true), 900);
      } else if (attempts.current >= 75) {
        clearInterval(interval); // ~5 menit (75 x 4 detik)
      }
    }, 4000);
    return () => clearInterval(interval);
  }, [info.requestId, info.paymentMethod, paid, router, onPaid]);

  useEffect(
    () => () => {
      if (paidTimer.current) clearTimeout(paidTimer.current);
    },
    [],
  );

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
          onPaid?.();
          router.refresh();
        });
      },
    });
  }, [info.paymentMethod, info.redirectUrl, info.requestId, router, onPaid]);

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
                <div className="relative h-40 w-40">
                  {showQrSpinner && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-white">
                      <Spinner className="h-7 w-7 text-neutral-400" />
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={info.qrUrl}
                    alt="QR pembayaran"
                    onLoad={() => setQrLoaded(true)}
                    onError={() => setQrLoaded(true)}
                    className="h-40 w-40 rounded-lg bg-white object-contain"
                  />
                </div>
                <p className="text-center text-xs text-neutral-500">
                  Scan pakai aplikasi{" "}
                  {info.paymentMethod === "GOPAY"
                    ? "Gojek / e-wallet"
                    : info.paymentMethod === "DANA"
                      ? "DANA"
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
              {verifying
                ? "Pembayaran diterima, memproses…"
                : "Menunggu pembayaran — halaman ini update otomatis begitu lunas."}
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
