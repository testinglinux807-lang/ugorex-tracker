"use client";

import { useActionState } from "react";
import {
  createVoucher,
  toggleVoucher,
  deleteVoucher,
} from "@/app/actions/vouchers";
import { voucherLabel } from "@/lib/voucher-calc";
import { Trash2 } from "lucide-react";
import { SubmitButton, PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export type VoucherRow = {
  id: string;
  code: string;
  type: string;
  value: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null; // ISO
  active: boolean;
};

// Kelola voucher toko (admin, menu Data): buat kode diskon yang bisa
// dipakai owner saat order restok & catat penjualan di POS.
export function VoucherManager({ vouchers }: { vouchers: VoucherRow[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createVoucher(fd)) ?? null,
    null,
  );

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <input
            name="code"
            required
            placeholder="Kode, mis. HEMAT10"
            className={`${inputCls} uppercase`}
          />
          <select name="type" className={inputCls} defaultValue="PERCENT">
            <option value="PERCENT">Diskon persen (%)</option>
            <option value="FIXED">Potongan Rupiah</option>
          </select>
          <input
            name="value"
            type="number"
            min={1}
            required
            placeholder="Nilai (10 = 10% / Rp10)"
            className={inputCls}
          />
          <input
            name="maxUses"
            type="number"
            min={1}
            placeholder="Kuota (kosong = bebas)"
            className={inputCls}
          />
          <div className="col-span-2">
            <label className="mb-1 block text-xs text-neutral-500">
              Kadaluarsa (opsional)
            </label>
            <input name="expiresAt" type="date" className={inputCls} />
          </div>
        </div>

        {state?.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            Voucher dibuat — bagikan kodenya ke owner.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <PendingLabel text="Menyimpan…" /> : "Buat Voucher"}
        </button>
      </form>

      {vouchers.length > 0 && (
        <ul className="divide-y divide-neutral-100">
          {vouchers.map((v) => {
            const expired =
              v.expiresAt !== null && new Date(v.expiresAt) < new Date();
            const habis = v.maxUses != null && v.usedCount >= v.maxUses;
            const dead = !v.active || expired || habis;
            return (
              <li key={v.id} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p
                    className={`font-mono font-semibold ${
                      dead ? "text-neutral-400 line-through" : "text-neutral-900"
                    }`}
                  >
                    {v.code}
                  </p>
                  <p className="text-xs text-neutral-400">
                    Diskon {voucherLabel(v)} · dipakai {v.usedCount}
                    {v.maxUses != null ? `/${v.maxUses}` : "×"}
                    {v.expiresAt
                      ? ` · s.d. ${new Date(v.expiresAt).toLocaleDateString(
                          "id-ID",
                          { day: "numeric", month: "short", year: "numeric" },
                        )}`
                      : ""}
                    {expired ? " (kadaluarsa)" : habis ? " (kuota habis)" : ""}
                  </p>
                </div>
                <form action={toggleVoucher.bind(null, v.id)}>
                  <SubmitButton
                    pendingText="…"
                    className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                      v.active
                        ? "border-neutral-900 bg-neutral-900 text-white"
                        : "border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                    }`}
                  >
                    {v.active ? "Aktif" : "Nonaktif"}
                  </SubmitButton>
                </form>
                <form action={deleteVoucher.bind(null, v.id)}>
                  <SubmitButton
                    pendingText="…"
                    title={`Hapus voucher ${v.code}`}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </SubmitButton>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
