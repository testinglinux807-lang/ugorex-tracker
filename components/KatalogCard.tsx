"use client";

import { useState } from "react";
import { createProspect } from "@/app/actions/tracker";
import { SubmitButton } from "@/components/SubmitButton";
import { Package, ArrowRight } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export function KatalogCard({
  product,
  stores,
}: {
  product: {
    id: string;
    name: string;
    price: number;
    description: string | null;
    imageUrl: string | null;
    central: number;
  };
  stores: { id: string; name: string; area: string | null }[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="relative aspect-square bg-neutral-100">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Package className="h-10 w-10 text-neutral-300" strokeWidth={1.5} />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="truncate text-sm font-semibold" title={product.name}>
          {product.name}
        </p>
        <p className="text-sm font-bold text-neutral-900">
          {rupiah(product.price)}
        </p>
        <p
          className={`text-xs ${
            product.central === 0
              ? "font-semibold text-red-600"
              : "text-neutral-500"
          }`}
        >
          Stok pusat: {product.central}
        </p>
        {product.description && (
          <p className="line-clamp-2 text-xs text-neutral-400">
            {product.description}
          </p>
        )}

        <div className="mt-auto pt-2">
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              disabled={stores.length === 0}
              className="w-full rounded-lg bg-neutral-900 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
            >
              Tawarkan ke Konter
            </button>
          ) : (
            <form action={createProspect} className="space-y-1.5">
              <input type="hidden" name="productId" value={product.id} />
              <select
                name="storeId"
                required
                autoFocus
                className="w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-xs"
              >
                <option value="">— Pilih konter —</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.area ? ` (${s.area})` : ""}
                  </option>
                ))}
              </select>
              <SubmitButton
                pendingText="Membuat…"
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand py-2 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
              >
                Mulai Tracking
                <ArrowRight className="h-3.5 w-3.5" />
              </SubmitButton>
            </form>
          )}
          {stores.length === 0 && (
            <p className="mt-1 text-center text-[11px] text-neutral-400">
              Belum ada konter yang kamu pegang
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
