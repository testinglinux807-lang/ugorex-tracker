"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import Script from "next/script";
import { useRouter } from "next/navigation";
import {
  createRequest,
  createRestockRequest,
  syncOrderPayment,
} from "@/app/actions/requests";
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  X,
  Package,
} from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";
import { VoucherInput, type AppliedVoucher } from "@/components/VoucherInput";
import { voucherDiscount } from "@/lib/voucher-calc";

// Popup pembayaran Midtrans Snap (dimuat lewat <Script> di bawah)
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

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const PER_PAGE = 6;

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type RestockProduct = {
  id: string;
  name: string;
  price: number; // harga satuan
  remaining: number; // sisa di toko owner
  central: number; // stok pusat yang bisa di-order
  imageUrl: string | null;
};

// Foto barang kecil dengan fallback ikon
function Thumb({
  src,
  alt,
  size = "h-10 w-10",
}: {
  src: string | null;
  alt: string;
  size?: string;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`${size} shrink-0 rounded-lg border border-neutral-200 object-cover`}
      />
    );
  }
  return (
    <div
      className={`flex ${size} shrink-0 items-center justify-center rounded-lg bg-neutral-100`}
    >
      <Package className="h-4 w-4 text-neutral-300" />
    </div>
  );
}

// Checkout restok: pilih barang + jumlah langsung dari stok pusat
function RestockForm({ products }: { products: RestockProduct[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) =>
      (await createRestockRequest(fd)) ?? null,
    null,
  );

  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [showReceipt, setShowReceipt] = useState(false);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);
  const router = useRouter();

  // Setelah order berhasil: tutup kwitansi & kosongkan keranjang
  // (reset saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) {
      setShowReceipt(false);
      setQtys({});
      setVoucher(null);
    }
  }

  // Begitu Snap token diterima: di HP langsung pindah ke halaman Snap
  // full-page (popup iframe Snap sering tidak bisa di-tap di browser HP,
  // dan e-wallet butuh deeplink yang diblokir dari iframe); di desktop
  // buka popup. Setelah bayar via popup, sinkronkan status ke server
  // (verifikasi + notif lunas) — webhook tidak sampai ke localhost.
  const handledToken = useRef<string | null>(null);
  useEffect(() => {
    const token = state?.ok ? state.snapToken : null;
    if (!token || handledToken.current === token) return;
    handledToken.current = token;

    const redirectUrl = state?.ok ? state.snapRedirectUrl : null;
    if (redirectUrl && window.matchMedia("(max-width: 768px)").matches) {
      window.location.assign(redirectUrl);
      return;
    }

    const requestId = state?.ok ? state.requestId : null;
    const sync = () => {
      if (requestId) syncOrderPayment(requestId).finally(() => router.refresh());
      else router.refresh();
    };
    window.snap?.pay(token, {
      onSuccess: sync,
      onPending: sync,
      onClose: () => router.refresh(),
    });
  }, [state, router]);

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        p.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [products, q],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(
    safePage * PER_PAGE,
    safePage * PER_PAGE + PER_PAGE,
  );
  const chosen = Object.entries(qtys).filter(([, n]) => n > 0);
  const cartSubtotal = chosen.reduce((a, [id, n]) => {
    const p = products.find((x) => x.id === id);
    return a + (p ? p.price * n : 0);
  }, 0);
  const discount = voucher ? voucherDiscount(voucher, cartSubtotal) : 0;
  const cartTotal = cartSubtotal - discount;

  // Jumlah order dibatasi stok pusat
  function setQty(id: string, n: number) {
    const max = products.find((p) => p.id === id)?.central ?? 0;
    setQtys((s) => ({ ...s, [id]: Math.min(max, Math.max(0, n)) }));
  }

  return (
    <form action={formAction} className="space-y-3">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Cari barang…"
          className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
        />
      </div>

      {/* Kartu produk ala marketplace (Shopee/Tokopedia) — pola yang sudah
          akrab buat owner: foto besar, harga, lalu tombol Tambah / stepper */}
      {view.length === 0 ? (
        <p className="px-1 py-2 text-sm text-neutral-400">
          Barang tidak ditemukan.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {view.map((p) => {
            const n = qtys[p.id] ?? 0;
            const empty = p.central === 0;
            return (
              <div
                key={p.id}
                className={`overflow-hidden rounded-xl border bg-white ${
                  n > 0 ? "border-neutral-900" : "border-neutral-200"
                }`}
              >
                <div className="relative aspect-square w-full bg-neutral-100">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className={`h-full w-full object-cover ${empty ? "opacity-40" : ""}`}
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center">
                      <Package className="h-8 w-8 text-neutral-300" />
                    </span>
                  )}
                  {empty && (
                    <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 bg-neutral-900/70 py-1 text-center text-[11px] font-bold text-white">
                      STOK PUSAT HABIS
                    </span>
                  )}
                  {n > 0 && (
                    <span className="absolute right-1.5 top-1.5 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-neutral-900">
                      ×{n}
                    </span>
                  )}
                </div>
                <div className="space-y-1 p-2">
                  <p className="line-clamp-2 min-h-8 text-xs font-medium leading-4">
                    {p.name}
                  </p>
                  <p className="text-sm font-bold">{rupiah(p.price)}</p>
                  <p className="text-[10px]">
                    <span
                      className={
                        empty
                          ? "font-semibold text-red-600"
                          : p.central <= 10
                            ? "font-semibold text-amber-600"
                            : "text-neutral-400"
                      }
                    >
                      Pusat: {p.central}
                    </span>
                    <span className="text-neutral-400"> · toko: {p.remaining}</span>
                  </p>
                  {n === 0 ? (
                    <button
                      type="button"
                      onClick={() => setQty(p.id, 1)}
                      disabled={empty}
                      className="w-full rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
                    >
                      + Keranjang
                    </button>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(p.id, n - 1)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                        aria-label={`Kurangi ${p.name}`}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <input
                        type="number"
                        min={0}
                        max={p.central}
                        value={n}
                        onChange={(e) =>
                          setQty(p.id, parseInt(e.target.value, 10) || 0)
                        }
                        aria-label={`Jumlah ${p.name}`}
                        className="h-7 w-full min-w-0 rounded-lg border border-neutral-300 px-1 text-center text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setQty(p.id, n + 1)}
                        disabled={n >= p.central}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
                        aria-label={`Tambah ${p.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-neutral-400">
            Hal {safePage + 1}/{pageCount}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Ringkasan keranjang + kirim qty semua barang terpilih (lintas halaman) */}
      {chosen.length > 0 && (
        <div className="space-y-1 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600">
          {chosen.map(([id, n]) => {
            const p = products.find((x) => x.id === id);
            if (!p) return null;
            return (
              <div key={id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {p.name} ×{n}
                </span>
                <span className="shrink-0 font-medium text-neutral-900">
                  {rupiah(p.price * n)}
                </span>
              </div>
            );
          })}
          {discount > 0 && (
            <>
              <div className="flex items-center justify-between border-t border-neutral-200 pt-1">
                <span>Subtotal</span>
                <span>{rupiah(cartSubtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Diskon ({voucher!.code})</span>
                <span>−{rupiah(discount)}</span>
              </div>
            </>
          )}
          <div
            className={`flex items-center justify-between pt-1 ${
              discount > 0 ? "" : "border-t border-neutral-200"
            }`}
          >
            <span className="font-semibold text-neutral-900">Total</span>
            <span className="text-sm font-bold text-neutral-900">
              {rupiah(cartTotal)}
            </span>
          </div>
        </div>
      )}
      {chosen.map(([id, n]) => (
        <input key={id} type="hidden" name={`qty__${id}`} value={n} />
      ))}

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
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          {state.snapToken
            ? "Order dibuat — selesaikan pembayaran di popup Midtrans."
            : "Order restok terkirim ke sales & admin."}
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
          : `Checkout — ${rupiah(cartTotal)}`}
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
              {chosen.map(([id, n]) => {
                const p = products.find((x) => x.id === id);
                if (!p) return null;
                return (
                  <div key={id} className="flex items-center gap-2">
                    <Thumb src={p.imageUrl} alt={p.name} size="h-9 w-9" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{p.name}</p>
                      <div className="flex justify-between text-neutral-500">
                        <span>
                          {n} × {rupiah(p.price)}
                        </span>
                        <span className="text-neutral-800">
                          {rupiah(p.price * n)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="my-3 border-t border-dashed border-neutral-300" />

            {discount > 0 && (
              <div className="mb-1 space-y-0.5 text-xs text-neutral-500">
                <div className="flex items-center justify-between">
                  <span>Subtotal</span>
                  <span>{rupiah(cartSubtotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span>Diskon ({voucher!.code})</span>
                  <span>−{rupiah(discount)}</span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">TOTAL</span>
              <span className="text-xl font-extrabold text-brand">
                {rupiah(cartTotal)}
              </span>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowReceipt(false)}
                disabled={pending}
                className="flex flex-1 items-center justify-center gap-1 rounded-lg border border-neutral-300 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
              >
                <X className="h-4 w-4" /> Batal
              </button>
              <button
                type="submit"
                disabled={pending}
                className="flex-1 rounded-lg bg-brand py-2 text-sm font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
              >
                {pending ? <PendingLabel text="Memproses…" /> : "Bayar Sekarang"}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}

// Request bebas (mis. minta dikunjungi sales)
function FreeForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createRequest(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-3">
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
export function RestockCheckout({ products }: { products: RestockProduct[] }) {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      {MIDTRANS_CLIENT_KEY && (
        <Script
          src={SNAP_URL}
          data-client-key={MIDTRANS_CLIENT_KEY}
          strategy="afterInteractive"
        />
      )}
      <h2 className="font-semibold">Order Restok</h2>
      <p className="text-xs text-neutral-400">
        Pilih barang & jumlah dari stok pusat yang tersedia — langsung checkout
        tanpa tunggu sales cek stok.
      </p>
      <RestockForm products={products} />
    </div>
  );
}

// Kartu request bebas — dipakai di halaman Request owner
export function FreeRequestForm() {
  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="font-semibold">Ajukan Request</h2>
      <p className="text-xs text-neutral-400">
        Mis. minta dikunjungi sales, komplain, dll.
      </p>
      <FreeForm />
    </div>
  );
}
