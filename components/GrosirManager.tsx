"use client";

import { useActionState } from "react";
import {
  createGrosirTier,
  toggleGrosirTier,
  deleteGrosirTier,
} from "@/app/actions/vouchers";
import { Trash2 } from "lucide-react";
import { SubmitButton, PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export type GrosirTierRow = {
  id: string;
  minQty: number;
  percent: number;
  active: boolean;
};

// Kelola diskon grosir (admin, menu Data — di bawah Voucher Toko): order
// restok yang total qty-nya mencapai tier otomatis dapat diskon persen,
// tanpa kode. Tier dengan minimal terbesar yang terpenuhi yang dipakai.
export function GrosirManager({ tiers }: { tiers: GrosirTierRow[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createGrosirTier(fd)) ?? null,
    null,
  );

  const sorted = [...tiers].sort((a, b) => a.minQty - b.minQty);

  return (
    <div className="space-y-4">
      <p className="text-xs text-neutral-400">
        Berlaku otomatis di order restok owner - tanpa kode. Contoh: minimal
        100 pcs diskon 10%. Kalau owner juga pakai voucher, voucher dihitung
        dari sisa setelah potongan grosir.
      </p>

      <form action={formAction} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="minQty"
            type="number"
            min={2}
            required
            placeholder="Minimal beli (pcs)"
            className={inputCls}
          />
          <input
            name="percent"
            type="number"
            min={1}
            max={100}
            required
            placeholder="Diskon (%)"
            className={inputCls}
          />
        </div>

        {state?.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            Tier grosir dibuat - langsung berlaku di checkout order.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <PendingLabel text="Menyimpan…" /> : "Tambah Tier Grosir"}
        </button>
      </form>

      {sorted.length > 0 && (
        <ul className="divide-y divide-neutral-100">
          {sorted.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p
                  className={`font-semibold ${
                    t.active ? "text-neutral-900" : "text-neutral-400 line-through"
                  }`}
                >
                  ≥ {t.minQty} pcs → diskon {t.percent}%
                </p>
              </div>
              <form action={toggleGrosirTier.bind(null, t.id)}>
                <SubmitButton
                  pendingText="…"
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                    t.active
                      ? "border-neutral-900 bg-neutral-900 text-white"
                      : "border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                  }`}
                >
                  {t.active ? "Aktif" : "Nonaktif"}
                </SubmitButton>
              </form>
              <form action={deleteGrosirTier.bind(null, t.id)}>
                <SubmitButton
                  pendingText="…"
                  title={`Hapus tier grosir ${t.minQty} pcs`}
                  className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
