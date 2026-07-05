// Hitung potongan voucher — dipakai server (validasi final) dan client
// (preview di form). Diskon tidak pernah melebihi subtotal.
export function voucherDiscount(
  v: { type: string; value: number },
  subtotal: number,
): number {
  const d =
    v.type === "PERCENT" ? Math.floor((subtotal * v.value) / 100) : v.value;
  return Math.max(0, Math.min(d, subtotal));
}

// Label singkat nilai voucher, mis. "10%" atau "Rp10.000"
export function voucherLabel(v: { type: string; value: number }): string {
  return v.type === "PERCENT"
    ? `${v.value}%`
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(v.value);
}
