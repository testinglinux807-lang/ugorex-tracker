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

// Tier diskon grosir yang berlaku untuk total qty order: minQty terbesar
// yang terpenuhi. null = belum mencapai tier manapun. Dipakai server
// (perhitungan final) dan client (preview keranjang) supaya angkanya sama.
export function grosirTierFor<T extends { minQty: number; percent: number }>(
  tiers: T[],
  totalQty: number,
): T | null {
  let best: T | null = null;
  for (const t of tiers) {
    if (totalQty >= t.minQty && (!best || t.minQty > best.minQty)) best = t;
  }
  return best;
}

// Potongan grosir dalam Rupiah — persen dari subtotal, dibulatkan ke bawah.
export function grosirDiscount(
  tier: { percent: number },
  subtotal: number,
): number {
  return Math.max(0, Math.min(Math.floor((subtotal * tier.percent) / 100), subtotal));
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
