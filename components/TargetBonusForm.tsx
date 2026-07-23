"use client";

import { useActionState, useState } from "react";
import { setTargetBonus, deleteTargetBonusPeriod } from "@/app/actions/config";
import { CodePicker, type RestockCode } from "@/components/CodePicker";
import { SubmitButton, PendingLabel } from "@/components/SubmitButton";
import { X, Trash2 } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

const ID_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];
function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${ID_MONTHS[m - 1]} ${y}`;
}

export type TargetBonusPeriodRow = {
  id: string;
  period: string; // "YYYY-MM"
  qty: number;
  productName: string;
  productCode: string | null;
};

// Admin atur "Target Bulanan" (menu Data - Voucher Toko): jadwal per bulan
// (target qty order RESTOK + 1 produk hadiah) - tiap bulan boleh beda
// produk/target-nya. Beda dari Voucher biasa (bukan kode manual, otomatis
// jalan begitu toko capai target restoknya bulan itu, lihat lib/target-bonus.ts).
export function TargetBonusForm({
  periods,
  codes,
}: {
  periods: TargetBonusPeriodRow[];
  codes: RestockCode[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await setTargetBonus(fd)) ?? null,
    null,
  );
  const [pickedCode, setPickedCode] = useState<string | null>(null);
  const byCode = new Map(codes.map((c) => [c.code, c]));
  const picked = pickedCode ? byCode.get(pickedCode) : null;

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <input name="period" type="month" required className={inputCls} />
          <input
            name="qty"
            type="number"
            min={1}
            placeholder="Target pcs, mis. 30"
            className={inputCls}
          />
          <div>
            <input type="hidden" name="productId" value={picked?.repId ?? ""} />
            {picked ? (
              <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-300 px-3 py-2">
                <span className="flex min-w-0 items-center gap-1.5 text-sm">
                  <span className="shrink-0 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                    {picked.code}
                  </span>
                  <span className="truncate">{picked.type}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setPickedCode(null)}
                  className="shrink-0 text-neutral-400 hover:text-neutral-700"
                  aria-label="Lepas pilihan produk"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <CodePicker codes={codes} onPick={setPickedCode} />
            )}
          </div>
        </div>
        <p className="text-xs text-neutral-400">
          Pilih bulan, target pcs order restok, dan produk hadiahnya. Bulan
          yang sudah ada jadwalnya bakal ditimpa kalau disimpan ulang.
        </p>

        {state?.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            Jadwal bulan itu disimpan.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Jadwal"}
        </button>
      </form>

      {periods.length > 0 && (
        <ul className="divide-y divide-neutral-100 border-t border-neutral-100 pt-2">
          {periods.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-neutral-900">
                  {periodLabel(p.period)}
                </p>
                <p className="text-xs text-neutral-400">
                  Capai {p.qty} pcs/bulan → gratis 1 {p.productName}
                  {p.productCode ? ` (${p.productCode})` : ""}
                </p>
              </div>
              <form action={deleteTargetBonusPeriod.bind(null, p.id)}>
                <SubmitButton
                  pendingText="…"
                  title={`Hapus jadwal ${periodLabel(p.period)}`}
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
