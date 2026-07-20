"use client";

import { useActionState, useState, useTransition } from "react";
import Script from "next/script";
import { createRequest, createRestockRequest } from "@/app/actions/requests";
import { X } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";
import { CodePicker, type RestockCode } from "@/components/CodePicker";
import { VoucherInput, type AppliedVoucher } from "@/components/VoucherInput";
import {
  voucherDiscount,
  grosirTierFor,
  grosirDiscount,
} from "@/lib/voucher-calc";
import { paymentFee } from "@/lib/payment-fee";
import {
  PaymentMethodPicker,
  CardFieldsInline,
  EMPTY_CARD,
  type PaymentMethod,
  type CardFields,
} from "@/components/PaymentMethodPicker";
import {
  PaymentInstructionPanel,
  type PaymentInfo,
} from "@/components/PaymentInstructionPanel";

const MIDTRANS_CLIENT_KEY = process.env.NEXT_PUBLIC_MIDTRANS_CLIENT_KEY;
const MIDTRANS_3DS_URL =
  process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com/v2/assets/js/midtrans-new-3ds.min.js"
    : "https://api.sandbox.midtrans.com/v2/assets/js/midtrans-new-3ds.min.js";

function tokenizeCard(card: CardFields): Promise<string | null> {
  return new Promise((resolve) => {
    if (!window.MidtransNew3ds) return resolve(null);
    window.MidtransNew3ds.getCardToken(
      {
        card_number: card.number,
        card_exp_month: card.expMonth,
        card_exp_year:
          card.expYear.length === 2 ? `20${card.expYear}` : card.expYear,
        card_cvv: card.cvv,
      },
      {
        onSuccess: (res) => resolve(res.token_id),
        onFailure: () => resolve(null),
      },
    );
  });
}

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Tier diskon grosir aktif (aturan admin) — dipakai untuk preview di
// keranjang; perhitungan final tetap di server.
export type GrosirTierInfo = { minQty: number; percent: number };

// Checkout restok: owner belanja per KODE mold (bukan per model HP). Tiap
// kode = satu barang fisik; catatan "Cocok" menampilkan tipe HP yang pas.
function RestockForm({
  codes,
  grosirTiers,
}: {
  codes: RestockCode[];
  grosirTiers: GrosirTierInfo[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) =>
      (await createRestockRequest(fd)) ?? null,
    null,
  );
  const [, startTransition] = useTransition();

  // qty di-key per KODE mold; lookup detail lewat byCode
  const byCode = new Map(codes.map((c) => [c.code, c]));
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [showReceipt, setShowReceipt] = useState(false);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const [method, setMethod] = useState<PaymentMethod>("CASH");
  const [card, setCard] = useState<CardFields>(EMPTY_CARD);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardError, setCardError] = useState<string | null>(null);
  const [paymentInfo, setPaymentInfo] = useState<PaymentInfo | null>(null);
  const paymentEnabled = !!MIDTRANS_CLIENT_KEY;

  // Setelah order berhasil: tutup kwitansi, kosongkan keranjang, dan buka
  // panel instruksi pembayaran (reset saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) {
      setShowReceipt(false);
      setQtys({});
      setVoucher(null);
      setCard(EMPTY_CARD);
      setPaymentInfo({
        requestId: state.requestId,
        paymentMethod: state.paymentMethod,
        grandTotal: state.grandTotal,
        vaNumber: state.vaNumber,
        vaBank: state.vaBank,
        qrUrl: state.qrUrl,
        deeplink: state.deeplink,
        paymentExpiry: state.paymentExpiry,
        redirectUrl: state.redirectUrl,
      });
    }
  }

  // Submit manual (bukan lewat action= form native) supaya kartu bisa
  // ditokenisasi dulu (async) sebelum data dikirim ke server action.
  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    if (method === "CARD") {
      setCardError(null);
      setCardBusy(true);
      const token = await tokenizeCard(card);
      setCardBusy(false);
      if (!token) {
        setCardError("Kartu tidak valid, coba periksa lagi.");
        return;
      }
      const fd = new FormData(formEl);
      fd.set("cardToken", token);
      startTransition(() => formAction(fd));
      return;
    }
    const fd = new FormData(formEl);
    startTransition(() => formAction(fd));
  }

  const chosen = Object.entries(qtys).filter(([, n]) => n > 0);
  const cartSubtotal = chosen.reduce((a, [code, n]) => {
    const c = byCode.get(code);
    return a + (c ? c.price * n : 0);
  }, 0);
  // Diskon grosir otomatis dari total qty; voucher dihitung dari sisanya —
  // urutan yang sama dengan perhitungan final di server.
  const totalQty = chosen.reduce((a, [, n]) => a + n, 0);
  const grosirTier = grosirTierFor(grosirTiers, totalQty);
  const grosir = grosirTier ? grosirDiscount(grosirTier, cartSubtotal) : 0;
  const discount = voucher
    ? voucherDiscount(voucher, cartSubtotal - grosir)
    : 0;
  const cartTotal = cartSubtotal - grosir - discount;
  const fee = method === "CASH" ? 0 : paymentFee(method, cartTotal);
  const grandTotal = cartTotal + fee;

  // Jumlah order dibatasi stok pusat (dibagi sekode)
  function setQty(code: string, n: number) {
    const max = byCode.get(code)?.central ?? 0;
    setQtys((s) => ({ ...s, [code]: Math.min(max, Math.max(0, n)) }));
  }

  // Pilih kode dari picker → masuk keranjang (atau qty +1 kalau sudah ada)
  function addCode(code: string) {
    const c = byCode.get(code);
    if (!c || c.central <= 0) return; // stok pusat habis
    setQty(code, (qtys[code] ?? 0) + 1);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {/* Pilih KODE mold (bukan per model HP) — tiap kode kasih catatan
          tipe HP yang kompatibel */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Tambah Barang (per kode)
        </label>
        <CodePicker codes={codes} onPick={addCode} />
        <p className="mt-1 text-xs text-neutral-400">
          Belanja per kode barang — cari pakai kode atau tipe HP mana pun yang
          cocok (mis. &quot;iPhone 17&quot;). Pilih lagi untuk menambah jumlah.
        </p>
      </div>

      {/* Keranjang gaya nota: baris teks tipis, hemat tempat */}
      {chosen.length > 0 && (
        <div className="border-y border-dashed border-neutral-300">
          {chosen.map(([code, n]) => {
            const c = byCode.get(code);
            if (!c) return null;
            const low = c.central <= 10;
            return (
              <div
                key={code}
                className="flex items-center gap-1.5 border-b border-dashed border-neutral-200 py-1.5 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="break-words leading-snug">
                    <span className="mr-1.5 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                      {c.code}
                    </span>
                    {c.type}
                  </p>
                  <p className="break-words text-[10px] leading-snug text-neutral-500">
                    Cocok {c.models.length} tipe: {c.models.join(", ")}
                  </p>
                  <p
                    className={`text-[10px] ${
                      low
                        ? "font-semibold text-amber-600"
                        : "text-neutral-400"
                    }`}
                  >
                    @{rupiah(c.price)} · stok pusat {c.central}
                  </p>
                </div>
                <input
                  type="number"
                  min={1}
                  max={c.central}
                  value={n}
                  onChange={(e) =>
                    setQty(code, parseInt(e.target.value, 10) || 1)
                  }
                  aria-label={`Jumlah ${c.code}`}
                  className="w-10 shrink-0 border-0 border-b border-neutral-300 bg-transparent p-0 text-center text-sm focus:border-neutral-900 focus:outline-none focus:ring-0"
                />
                <span className="w-16 shrink-0 text-right text-sm font-semibold">
                  {(n * c.price).toLocaleString("id-ID")}
                </span>
                <button
                  type="button"
                  onClick={() => setQty(code, 0)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label={`Hapus ${c.code}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <input type="hidden" name={`qty__${c.repId}`} value={n} />
              </div>
            );
          })}
        </div>
      )}

      {/* Total otomatis, gaya nota */}
      <div className="space-y-0.5 px-0.5">
        {(grosir > 0 || discount > 0 || fee > 0) && (
          <div className="flex items-baseline justify-between text-sm text-neutral-500">
            <span>Subtotal</span>
            <span>{rupiah(cartSubtotal)}</span>
          </div>
        )}
        {grosir > 0 && (
          <div className="flex items-baseline justify-between text-sm text-neutral-500">
            <span>
              Diskon grosir {grosirTier!.percent}% (≥{grosirTier!.minQty} pcs)
            </span>
            <span>−{rupiah(grosir)}</span>
          </div>
        )}
        {discount > 0 && (
          <div className="flex items-baseline justify-between text-sm text-neutral-500">
            <span>Diskon ({voucher!.code})</span>
            <span>−{rupiah(discount)}</span>
          </div>
        )}
        {fee > 0 && (
          <div className="flex items-baseline justify-between text-sm text-neutral-500">
            <span>Biaya layanan</span>
            <span>{rupiah(fee)}</span>
          </div>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-neutral-700">
            TOTAL{chosen.length > 0 ? ` (${chosen.length} barang)` : ""}
          </span>
          <span className="text-lg font-bold">{rupiah(grandTotal)}</span>
        </div>
      </div>

      {/* Voucher toko (opsional, dibuat admin) */}
      {chosen.length > 0 && (
        <VoucherInput applied={voucher} onApplied={setVoucher} />
      )}

      <input
        name="note"
        placeholder="Catatan (opsional)"
        className={inputCls}
      />

      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {state.error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setShowReceipt(true)}
        disabled={chosen.length === 0}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
      >
        {chosen.length === 0
          ? "Checkout"
          : `Checkout — ${rupiah(grandTotal)}`}
      </button>

      {/* Popup kwitansi: rincian order sebelum bayar */}
      {showReceipt && (
        <div
          className="animate-ugfade fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pending && setShowReceipt(false)}
        >
          <div
            className="animate-ugscalein w-80 max-w-full rounded-2xl bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-center">
              <p className="text-lg font-extrabold tracking-tight">UGOREX</p>
              <p className="text-[11px] text-neutral-400">
                Kwitansi Order Restok
              </p>
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <p className="text-xs text-neutral-500">
              {new Date().toLocaleDateString("id-ID", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            <div className="max-h-48 space-y-1.5 overflow-y-auto text-sm">
              {chosen.map(([code, n]) => {
                const c = byCode.get(code);
                if (!c) return null;
                return (
                  <div key={code} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="break-words font-medium leading-snug">
                        <span className="mr-1.5 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                          {c.code}
                        </span>
                        {c.type}
                      </p>
                      <p className="break-words text-[11px] leading-snug text-neutral-400">
                        Cocok {c.models.length} tipe: {c.models.join(", ")}
                      </p>
                      <div className="flex justify-between text-neutral-500">
                        <span>
                          {n} × {rupiah(c.price)}
                        </span>
                        <span className="text-neutral-800">
                          {rupiah(c.price * n)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            {(grosir > 0 || discount > 0) && (
              <div className="mb-1 space-y-0.5 text-xs text-neutral-500">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{rupiah(cartSubtotal)}</span>
                </div>
                {grosir > 0 && (
                  <div className="flex items-center justify-between">
                    <span>
                      Diskon grosir {grosirTier!.percent}% (≥
                      {grosirTier!.minQty} pcs)
                    </span>
                    <span>−{rupiah(grosir)}</span>
                  </div>
                )}
                {discount > 0 && (
                  <div className="flex items-center justify-between">
                    <span>Diskon ({voucher!.code})</span>
                    <span>−{rupiah(discount)}</span>
                  </div>
                )}
              </div>
            )}
            {fee > 0 && (
              <div className="mb-1 flex items-center justify-between text-xs text-neutral-500">
                <span>Biaya layanan</span>
                <span>{rupiah(fee)}</span>
              </div>
            )}
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold">TOTAL</span>
              <span className="text-xl font-extrabold text-brand">
                {rupiah(grandTotal)}
              </span>
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            {paymentEnabled ? (
              <PaymentMethodPicker
                method={method}
                onChange={setMethod}
                amount={cartTotal}
              />
            ) : (
              <p className="text-xs text-neutral-400">
                Pembayaran online belum aktif — order dicatat sebagai cash.
              </p>
            )}
            {method === "CARD" && (
              <div className="mt-2">
                <CardFieldsInline value={card} onChange={setCard} />
              </div>
            )}
            {cardError && (
              <p className="mt-1 text-xs font-medium text-red-600">
                {cardError}
              </p>
            )}
            {state?.error && (
              <p className="mt-2 rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900">
                {state.error}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                disabled={pending || cardBusy}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
              >
                <X className="h-4 w-4" /> Batal
              </button>
              <button
                type="submit"
                disabled={pending || cardBusy}
                className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
              >
                {pending || cardBusy ? (
                  <PendingLabel text="Memproses…" />
                ) : method === "CASH" ? (
                  "Buat Order"
                ) : (
                  "Bayar Sekarang"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {paymentInfo && (
        <PaymentInstructionPanel
          info={paymentInfo}
          onClose={() => setPaymentInfo(null)}
        />
      )}
    </form>
  );
}

// Konter pilihan di form request versi sales (yang dia pegang)
export type RequestStoreOption = { id: string; name: string };

// Request bebas (mis. minta dikunjungi sales). Owner: toko otomatis toko
// miliknya. Sales: wajib pilih konter yang dia pegang (prop stores).
function FreeForm({ stores }: { stores?: RequestStoreOption[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createRequest(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
      {stores && (
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Konter <span className="text-neutral-900">*</span>
          </label>
          <select name="storeId" required defaultValue="" className={inputCls}>
            <option value="" disabled>
              Pilih konter…
            </option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Judul <span className="text-neutral-900">*</span>
        </label>
        <input
          name="subject"
          required
          placeholder="Mis. Minta dikunjungi sales"
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
        {pending ? <PendingLabel text="Mengirim…" /> : "Kirim Request"}
      </button>
    </form>
  );
}

// Kartu checkout restok — dipakai di halaman Order owner
export function RestockCheckout({
  codes,
  grosirTiers = [],
}: {
  codes: RestockCode[];
  grosirTiers?: GrosirTierInfo[];
}) {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      {MIDTRANS_CLIENT_KEY && (
        <Script
          src={MIDTRANS_3DS_URL}
          data-environment={
            process.env.NEXT_PUBLIC_MIDTRANS_IS_PRODUCTION === "true"
              ? "production"
              : "sandbox"
          }
          data-client-key={MIDTRANS_CLIENT_KEY}
          strategy="afterInteractive"
        />
      )}
      <h2 className="font-semibold">Order Restok</h2>
      <p className="text-xs text-neutral-400">
        Belanja per kode barang dari stok pusat — tiap kode ada catatan tipe HP
        yang cocok. Langsung checkout tanpa tunggu sales cek stok.
      </p>
      <RestockForm codes={codes} grosirTiers={grosirTiers} />
    </div>
  );
}

// Kartu request bebas — dipakai di halaman Request. Owner tanpa prop stores;
// sales kirim daftar konter yang dia pegang (catat keluhan atas nama konter).
export function FreeRequestForm({ stores }: { stores?: RequestStoreOption[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="font-semibold">Ajukan Request</h2>
      <p className="text-xs text-neutral-400">
        {stores
          ? "Catat keluhan/permintaan yang disampaikan konter langsung ke kamu."
          : "Mis. minta dikunjungi sales, komplain, dll."}
      </p>
      <FreeForm stores={stores} />
    </div>
  );
}
