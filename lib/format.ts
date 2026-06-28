// Format Rupiah penuh: Rp 19.555.000
export function rupiah(n: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);
}

// Format Rupiah singkat: Rp 19,6jt / Rp 1,2M / Rp 850rb
export function rupiahShort(n: number): string {
  const fmt = (v: number) =>
    (v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)).replace(".", ",");
  if (n >= 1_000_000_000) return `Rp ${fmt(n / 1_000_000_000)}M`;
  if (n >= 1_000_000) return `Rp ${fmt(n / 1_000_000)}jt`;
  if (n >= 1_000) return `Rp ${Math.round(n / 1_000)}rb`;
  return `Rp ${n}`;
}
