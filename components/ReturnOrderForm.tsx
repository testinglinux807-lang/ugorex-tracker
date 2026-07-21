"use client";

import { useActionState, useState } from "react";
import { PackageX } from "lucide-react";
import { returnOrder } from "@/app/actions/requests";
import { SubmitButton } from "@/components/SubmitButton";

// Pengembalian pesanan oleh owner toko saat kurir datang (status Dikirim):
// pilih SEMUA barang atau SEBAGIAN (isi qty per barang) + alasan wajib.
// Dilipat dalam <details> supaya tidak kepencet — pola sama dengan
// CancelOrderForm. Sukses → kartu re-render (Diretur / retur sebagian).
export function ReturnOrderForm({
  requestId,
  items,
}: {
  requestId: string;
  items: { id: string; name: string; qty: number }[];
}) {
  const [mode, setMode] = useState<"ALL" | "PARTIAL">("ALL");
  const [state, formAction] = useActionState(
    async (_prev: { error?: string } | null, fd: FormData) =>
      returnOrder(requestId, fd),
    null,
  );

  const modeBtn = (key: "ALL" | "PARTIAL", label: string) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-semibold transition ${
        mode === key
          ? "border-red-600 bg-red-600 text-white"
          : "border-red-200 bg-white text-red-600 hover:bg-red-100"
      }`}
    >
      {label}
    </button>
  );

  return (
    // open:col-span-full — form terbuka melebar selebar footer OrderCard
    <details className="w-full open:col-span-full">
      <summary className="flex w-full cursor-pointer items-center justify-center gap-1 rounded-lg border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 [&::-webkit-details-marker]:hidden">
        <PackageX className="h-3.5 w-3.5" />
        Pengembalian Pesanan
      </summary>
      <form
        action={formAction}
        className="mt-2 space-y-2 rounded-lg border border-red-200 bg-red-50 p-2.5"
      >
        <p className="text-xs font-semibold text-red-700">
          Tolak barang saat serah terima - barang yang dikembalikan balik ke
          gudang pusat dan tagihanmu dikurangi.
        </p>

        <input type="hidden" name="mode" value={mode} />
        <div className="flex gap-1.5">
          {modeBtn("ALL", "Kembalikan Semua")}
          {modeBtn("PARTIAL", "Sebagian Saja")}
        </div>

        {mode === "PARTIAL" && (
          <div className="space-y-1.5 rounded-lg border border-red-200 bg-white p-2">
            <p className="text-[11px] font-medium text-neutral-500">
              Isi jumlah yang DIKEMBALIKAN per barang (0 = diterima semua):
            </p>
            {items.map((it) => (
              <label
                key={it.id}
                className="flex items-center justify-between gap-2 text-xs"
              >
                <span className="min-w-0 flex-1 truncate">
                  {it.name}{" "}
                  <span className="text-neutral-400">(order {it.qty})</span>
                </span>
                <input
                  name={`ret__${it.id}`}
                  type="number"
                  min={0}
                  max={it.qty}
                  defaultValue={0}
                  inputMode="numeric"
                  className="w-16 rounded-lg border border-neutral-300 px-2 py-1 text-right text-xs focus:border-neutral-900 focus:outline-none"
                />
              </label>
            ))}
          </div>
        )}

        <textarea
          name="reason"
          rows={2}
          required
          placeholder="Alasan pengembalian (wajib, mis. barang tidak sesuai)"
          className="w-full rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs focus:border-red-400 focus:outline-none"
        />
        {state?.error && (
          <p className="text-xs font-medium text-red-700">{state.error}</p>
        )}
        <SubmitButton
          pendingText="Memproses…"
          overlayText="Memproses pengembalian…"
          className="w-full rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
        >
          {mode === "ALL" ? "Kembalikan Semua Barang" : "Proses Pengembalian"}
        </SubmitButton>
      </form>
    </details>
  );
}
