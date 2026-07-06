"use client";

import {
  Landmark,
  QrCode,
  Wallet,
  WalletCards,
  CreditCard,
  Banknote,
} from "lucide-react";
import { paymentFee } from "@/lib/payment-fee";

export type PaymentMethod =
  | "VA_BCA"
  | "VA_BNI"
  | "VA_BRI"
  | "VA_PERMATA"
  | "QRIS"
  | "GOPAY"
  | "DANA"
  | "CARD"
  | "CASH";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const VA_BANKS: { method: PaymentMethod; label: string }[] = [
  { method: "VA_BCA", label: "BCA" },
  { method: "VA_BNI", label: "BNI" },
  { method: "VA_BRI", label: "BRI" },
  { method: "VA_PERMATA", label: "Permata" },
];

type Group = "VA" | "QRIS" | "GOPAY" | "DANA" | "CARD" | "CASH";

const METHODS: {
  key: Group;
  label: string;
  icon: typeof Landmark;
  hasFee: boolean;
}[] = [
  { key: "VA", label: "Transfer Bank", icon: Landmark, hasFee: true },
  { key: "QRIS", label: "QRIS", icon: QrCode, hasFee: true },
  { key: "GOPAY", label: "GoPay", icon: Wallet, hasFee: true },
  { key: "DANA", label: "DANA", icon: WalletCards, hasFee: true },
  { key: "CARD", label: "Kartu", icon: CreditCard, hasFee: true },
  { key: "CASH", label: "Cash", icon: Banknote, hasFee: false },
];

function groupOf(m: PaymentMethod | null): Group | null {
  if (m == null) return null;
  if (m.startsWith("VA_")) return "VA";
  return m as Group;
}

// Pemilih metode pembayaran ala Tokopedia/Shopee — dipakai di popup kwitansi
// checkout restok. Emit "paymentMethod" lewat hidden input supaya langsung
// ikut form Server Action, tanpa perlu state tambahan di parent.
export function PaymentMethodPicker({
  method,
  onChange,
  amount,
}: {
  method: PaymentMethod | null;
  onChange: (m: PaymentMethod) => void;
  amount: number; // total produk — untuk hitung fee per metode
}) {
  const activeGroup = groupOf(method);

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-neutral-700">
        Metode Pembayaran
      </p>
      <div className="grid grid-cols-2 gap-1.5">
        {METHODS.map((m) => {
          const on = activeGroup === m.key;
          const Icon = m.icon;
          return (
            <button
              key={m.key}
              type="button"
              onClick={() =>
                onChange(m.key === "VA" ? "VA_BCA" : (m.key as PaymentMethod))
              }
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-medium transition-colors ${
                on
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">
                {m.label}
              </span>
              <span
                className={`shrink-0 text-[10px] ${on ? "text-white/70" : "text-neutral-400"}`}
              >
                {m.hasFee ? `+${rupiah(paymentFee(m.key, amount))}` : "Gratis"}
              </span>
            </button>
          );
        })}
      </div>

      {activeGroup === "VA" && (
        <div className="flex flex-wrap gap-1.5">
          {VA_BANKS.map((b) => (
            <button
              key={b.method}
              type="button"
              onClick={() => onChange(b.method)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${
                method === b.method
                  ? "border-brand-dark bg-brand text-neutral-900"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      <input type="hidden" name="paymentMethod" value={method ?? ""} />
    </div>
  );
}

export type CardFields = {
  number: string;
  expMonth: string;
  expYear: string;
  cvv: string;
};

export const EMPTY_CARD: CardFields = {
  number: "",
  expMonth: "",
  expYear: "",
  cvv: "",
};

// Input kartu polos (bukan dikirim ke server kita — ditokenisasi langsung
// ke Midtrans lewat MidtransNew3ds.getCardToken sebelum submit).
export function CardFieldsInline({
  value,
  onChange,
}: {
  value: CardFields;
  onChange: (v: CardFields) => void;
}) {
  const cls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
  return (
    <div className="space-y-2 rounded-lg border border-dashed border-neutral-300 p-2.5">
      <input
        inputMode="numeric"
        placeholder="Nomor kartu"
        value={value.number}
        onChange={(e) =>
          onChange({
            ...value,
            number: e.target.value.replace(/\D/g, "").slice(0, 19),
          })
        }
        className={cls}
      />
      <div className="grid grid-cols-3 gap-1.5">
        <input
          inputMode="numeric"
          placeholder="MM"
          value={value.expMonth}
          onChange={(e) =>
            onChange({
              ...value,
              expMonth: e.target.value.replace(/\D/g, "").slice(0, 2),
            })
          }
          className={cls}
        />
        <input
          inputMode="numeric"
          placeholder="YY"
          value={value.expYear}
          onChange={(e) =>
            onChange({
              ...value,
              expYear: e.target.value.replace(/\D/g, "").slice(0, 2),
            })
          }
          className={cls}
        />
        <input
          inputMode="numeric"
          placeholder="CVV"
          value={value.cvv}
          onChange={(e) =>
            onChange({
              ...value,
              cvv: e.target.value.replace(/\D/g, "").slice(0, 4),
            })
          }
          className={cls}
        />
      </div>
    </div>
  );
}
