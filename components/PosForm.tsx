"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSale } from "@/app/actions/pos";
import { SuccessPopup } from "@/components/SuccessPopup";
import { ProductPicker } from "@/components/ProductPicker";
import { PendingLabel } from "@/components/SubmitButton";
import { VoucherInput, type AppliedVoucher } from "@/components/VoucherInput";
import { voucherDiscount } from "@/lib/voucher-calc";
import { X } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

type CartLine = { productId: string; qty: number; price: number };

// Catat penjualan model keranjang: pembeli sering bawa beberapa barang
// sekaligus — pilih barang berulang kali, atur jumlah & harga per barang,
// lalu simpan semuanya dalam satu kali "Catat Penjualan".
export function PosForm({
  products,
}: {
  products: { id: string; name: string; price: number; remaining: number }[];
}) {
  const [pickerId, setPickerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [voucher, setVoucher] = useState<AppliedVoucher | null>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createSale(fd)) ?? null,
    null,
  );

  // Pop-up sukses beranimasi + kosongkan keranjang
  const [popup, setPopup] = useState<string | null>(null);
  const lastTotal = useRef(0);
  useEffect(() => {
    if (state?.ok) {
      setPopup(rupiah(lastTotal.current));
      setCart([]);
      setVoucher(null);
      const t = setTimeout(() => setPopup(null), 2200);
      return () => clearTimeout(t);
    }
  }, [state]);

  const prodOf = (id: string) => products.find((x) => x.id === id);

  // Pilih barang dari picker → langsung masuk keranjang (atau qty +1
  // kalau sudah ada), picker direset supaya siap pilih barang berikutnya.
  function addProduct(id: string) {
    if (!id) return;
    setPickerId("");
    const p = prodOf(id);
    if (!p || p.remaining <= 0) return; // habis — minta restok dulu
    setCart((c) => {
      const ex = c.find((l) => l.productId === id);
      if (ex) {
        return c.map((l) =>
          l.productId === id
            ? { ...l, qty: Math.min(p.remaining, l.qty + 1) }
            : l,
        );
      }
      return [...c, { productId: id, qty: 1, price: p.price }];
    });
  }

  function setQty(id: string, n: number) {
    const max = prodOf(id)?.remaining ?? 0;
    setCart((c) =>
      c.map((l) =>
        l.productId === id
          ? { ...l, qty: Math.min(max, Math.max(1, n)) }
          : l,
      ),
    );
  }

  function setPrice(id: string, n: number) {
    setCart((c) =>
      c.map((l) => (l.productId === id ? { ...l, price: Math.max(0, n) } : l)),
    );
  }

  function removeLine(id: string) {
    setCart((c) => c.filter((l) => l.productId !== id));
  }

  const subtotal = cart.reduce((a, l) => a + l.qty * l.price, 0);
  const discount = voucher ? voucherDiscount(voucher, subtotal) : 0;
  const total = subtotal - discount;
  const invalid = cart.some((l) => l.price <= 0);

  return (
    <form
      action={formAction}
      onSubmit={() => {
        lastTotal.current = total;
      }}
      className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5"
    >
      <SuccessPopup
        show={!!popup}
        title="Penjualan Tercatat!"
        subtitle={popup ?? undefined}
      />

      <h2 className="font-semibold">Catat Penjualan</h2>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Tambah Barang
        </label>
        <ProductPicker
          products={products}
          value={pickerId}
          onChange={addProduct}
        />
        <p className="mt-1 text-xs text-neutral-400">
          Pilih barang lagi untuk menambah ke daftar — bisa beberapa barang
          dalam satu transaksi.
        </p>
      </div>

      {/* Keranjang gaya nota: baris teks tipis, hemat tempat */}
      {cart.length > 0 && (
        <div className="border-y border-dashed border-neutral-300">
          {cart.map((l) => {
            const p = prodOf(l.productId);
            if (!p) return null;
            const low = p.remaining <= 10;
            return (
              <div
                key={l.productId}
                className="flex items-center gap-1.5 border-b border-dashed border-neutral-200 py-1.5 text-sm last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate">{p.name}</p>
                  {low && (
                    <p className="text-[10px] font-semibold text-amber-600">
                      Sisa stok {p.remaining}
                    </p>
                  )}
                </div>
                <input
                  type="number"
                  min={1}
                  max={p.remaining}
                  value={l.qty}
                  onChange={(e) =>
                    setQty(l.productId, parseInt(e.target.value, 10) || 1)
                  }
                  aria-label={`Jumlah ${p.name}`}
                  className="w-10 shrink-0 border-0 border-b border-neutral-300 bg-transparent p-0 text-center text-sm focus:border-neutral-900 focus:outline-none focus:ring-0"
                />
                <span className="shrink-0 text-neutral-400">×</span>
                <input
                  type="number"
                  min={0}
                  value={l.price}
                  onChange={(e) =>
                    setPrice(l.productId, parseInt(e.target.value, 10) || 0)
                  }
                  aria-label={`Harga satuan ${p.name}`}
                  className="w-16 shrink-0 border-0 border-b border-neutral-300 bg-transparent p-0 text-right text-sm focus:border-neutral-900 focus:outline-none focus:ring-0"
                />
                <span className="w-16 shrink-0 text-right text-sm font-semibold">
                  {(l.qty * l.price).toLocaleString("id-ID")}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(l.productId)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
                  aria-label={`Hapus ${p.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
                <input type="hidden" name={`qty__${l.productId}`} value={l.qty} />
                <input
                  type="hidden"
                  name={`price__${l.productId}`}
                  value={l.price}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Voucher toko (opsional, dibuat admin) */}
      {cart.length > 0 && (
        <VoucherInput applied={voucher} onApplied={setVoucher} />
      )}

      {/* Total otomatis, gaya nota */}
      <div className="space-y-0.5 px-0.5">
        {discount > 0 && (
          <>
            <div className="flex items-baseline justify-between text-sm text-neutral-500">
              <span>Subtotal</span>
              <span>{rupiah(subtotal)}</span>
            </div>
            <div className="flex items-baseline justify-between text-sm text-neutral-500">
              <span>Diskon ({voucher!.code})</span>
              <span>−{rupiah(discount)}</span>
            </div>
          </>
        )}
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-semibold text-neutral-700">
            TOTAL{cart.length > 0 ? ` (${cart.length} barang)` : ""}
          </span>
          <span className="text-lg font-bold">{rupiah(total)}</span>
        </div>
      </div>

      {invalid && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          Harga tiap barang wajib diisi (lebih dari 0).
        </p>
      )}

      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || cart.length === 0 || invalid}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? (
          <PendingLabel text="Menyimpan…" />
        ) : cart.length === 0 ? (
          "Catat Penjualan"
        ) : (
          `Catat Penjualan — ${rupiah(total)}`
        )}
      </button>
    </form>
  );
}
