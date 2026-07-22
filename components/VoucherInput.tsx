"use client";

import { useState } from "react";
import { checkVoucher } from "@/app/actions/vouchers";
import { voucherLabel } from "@/lib/voucher-calc";
import { TicketPercent, X } from "lucide-react";
import { Spinner } from "@/components/SubmitButton";

export type AppliedVoucher = {
  code: string;
  type: string;
  value: number;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
};

const MAX_VOUCHERS = 3;

// Input kode voucher untuk form checkout/POS — bisa lebih dari 1 sekaligus
// (maks 3, 1 per jenis FREE/PERCENT/FIXED). Tiap voucher yg lolos dicek
// dikirim lewat hidden input "voucherCode" (diulang per voucher) dan parent
// diberi tahu via onApplied supaya bisa menghitung & menampilkan potongannya.
// Validasi final (kuota, jenis dobel, dll) tetap di server saat submit.
export function VoucherInput({
  applied,
  onApplied,
}: {
  applied: AppliedVoucher[];
  onApplied: (v: AppliedVoucher[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function apply() {
    const c = code.trim();
    if (!c) return;
    if (applied.length >= MAX_VOUCHERS) {
      setError(`Maksimal ${MAX_VOUCHERS} voucher sekaligus.`);
      return;
    }
    setPending(true);
    setError(null);
    const res = await checkVoucher(c);
    setPending(false);
    if (!res || "error" in res) {
      setError(res?.error ?? "Gagal mengecek voucher.");
      return;
    }
    if (applied.some((v) => v.code === res.code)) {
      setError("Voucher ini udah dipakai.");
      return;
    }
    if (applied.some((v) => v.type === res.type)) {
      setError(`Udah ada voucher jenis ${voucherLabel(res)} - lepas dulu kalau mau ganti.`);
      return;
    }
    onApplied([
      ...applied,
      {
        code: res.code,
        type: res.type,
        value: res.value,
        productId: res.productId,
        productCode: res.productCode,
        productName: res.productName,
      },
    ]);
    setCode("");
  }

  function remove(code: string) {
    onApplied(applied.filter((v) => v.code !== code));
  }

  return (
    <div className="space-y-1.5">
      {applied.map((v) => (
        <div key={v.code}>
          <input type="hidden" name="voucherCode" value={v.code} />
          <div className="flex items-center justify-between gap-2 rounded-lg border border-brand-dark/40 bg-brand/15 px-3 py-2">
            <span className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-neutral-800">
              <TicketPercent className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {v.code} - {voucherLabel(v)}
                {v.productName ? ` khusus ${v.productName}` : ""}
              </span>
            </span>
            <button
              type="button"
              onClick={() => remove(v.code)}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-white/60"
              aria-label={`Lepas voucher ${v.code}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      {applied.length < MAX_VOUCHERS && (
        <div className="flex gap-1.5">
          <div className="relative min-w-0 flex-1">
            <TicketPercent className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                }
              }}
              placeholder={
                applied.length > 0
                  ? "Tambah voucher lain (opsional)"
                  : "Kode voucher (opsional)"
              }
              className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm uppercase"
            />
          </div>
          <button
            type="button"
            onClick={apply}
            disabled={pending || !code.trim()}
            className="shrink-0 rounded-lg border border-neutral-900 px-3 py-2 text-xs font-semibold text-neutral-900 hover:bg-neutral-100 disabled:opacity-50"
          >
            {pending ? <Spinner className="h-3.5 w-3.5" /> : "Pakai"}
          </button>
        </div>
      )}
      {error && (
        <p className="mt-1 text-xs font-medium text-red-600">{error}</p>
      )}
    </div>
  );
}
