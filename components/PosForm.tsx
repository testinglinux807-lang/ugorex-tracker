"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createSale } from "@/app/actions/pos";
import { SuccessPopup } from "@/components/SuccessPopup";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export function PosForm({
  products,
}: {
  products: { id: string; name: string; price: number; remaining: number }[];
}) {
  const [productId, setProductId] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);

  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createSale(fd)) ?? null,
    null,
  );

  // Pop-up sukses beranimasi
  const [popup, setPopup] = useState<string | null>(null);
  const lastTotal = useRef(0);
  useEffect(() => {
    if (state?.ok) {
      setPopup(rupiah(lastTotal.current));
      setQty(1); // reset jumlah buat transaksi berikutnya
      const t = setTimeout(() => setPopup(null), 2200);
      return () => clearTimeout(t);
    }
  }, [state]);

  const picked = products.find((x) => x.id === productId);
  const remaining = picked?.remaining ?? 0;
  const total = (qty || 0) * (price || 0);
  const overStock = !!picked && qty > remaining;
  const outOfStock = !!picked && remaining <= 0;

  function onPickProduct(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) setPrice(p.price); // auto-isi harga dari barang
  }

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
          Barang
        </label>
        <select
          name="productId"
          required
          value={productId}
          onChange={(e) => onPickProduct(e.target.value)}
          className={inputCls}
        >
          <option value="">— Pilih barang —</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {rupiah(p.price)} (sisa {p.remaining})
            </option>
          ))}
        </select>
        {picked && (
          <p
            className={`mt-1 text-xs ${
              outOfStock
                ? "font-semibold text-red-600"
                : remaining <= 10
                  ? "font-semibold text-amber-600"
                  : "text-neutral-500"
            }`}
          >
            Sisa stok: {remaining}
            {outOfStock ? " — habis, minta restok ke sales" : ""}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Jumlah
          </label>
          <input
            name="qty"
            type="number"
            min={1}
            max={picked ? remaining : undefined}
            value={qty}
            onChange={(e) => setQty(parseInt(e.target.value, 10) || 0)}
            required
            className={`${inputCls} ${overStock ? "border-red-400" : ""}`}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Harga satuan (Rp)
          </label>
          <input
            name="price"
            type="number"
            min={0}
            value={price}
            onChange={(e) => setPrice(parseInt(e.target.value, 10) || 0)}
            required
            className={inputCls}
          />
        </div>
      </div>

      {/* Total otomatis */}
      <div className="flex items-center justify-between rounded-lg bg-neutral-100 px-3 py-2">
        <span className="text-sm text-neutral-600">Total</span>
        <span className="text-lg font-bold">{rupiah(total)}</span>
      </div>

      {overStock && !outOfStock && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          Jumlah melebihi sisa stok ({remaining}).
        </p>
      )}

      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || overStock || outOfStock}
        className="w-full rounded-lg bg-brand py-2.5 text-sm font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Catat Penjualan"}
      </button>
    </form>
  );
}
