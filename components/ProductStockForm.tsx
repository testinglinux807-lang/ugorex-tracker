"use client";

import { useActionState } from "react";
import { updateProductStock } from "@/app/actions/tracker";
import { Check } from "lucide-react";
import { Spinner } from "@/components/SubmitButton";

// Edit stok pusat/gudang per barang (menu Data, admin)
export function ProductStockForm({
  productId,
  stock,
}: {
  productId: string;
  stock: number;
}) {
  const action = updateProductStock.bind(null, productId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="flex items-center gap-1">
      <input
        name="centralStock"
        type="number"
        min={0}
        defaultValue={stock}
        aria-label="Stok pusat"
        className="h-7 w-16 rounded-lg border border-neutral-300 px-1 text-center text-xs"
      />
      <button
        type="submit"
        disabled={pending}
        title="Simpan stok pusat"
        className="flex h-7 w-7 items-center justify-center rounded-lg bg-neutral-900 text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? (
          <Spinner className="h-3.5 w-3.5" />
        ) : (
          <Check className="h-3.5 w-3.5" />
        )}
      </button>
      {state?.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
