// Kunci pencocokan produk voucher: barang sekode (mis. varian HP yang
// berbagi kode mold) dianggap SATU target, karena "produk perwakilan" yang
// dikirim ke server bisa beda-beda per toko (lihat app/(app)/order/page.tsx
// repId - dipilih dari stok toko terbanyak). Produk tanpa kode dicocokkan
// per id-nya sendiri.
export function voucherScopeKey(p: { id: string; code: string | null }): string {
  return p.code ?? `id:${p.id}`;
}

export type VoucherLike = {
  code: string;
  type: string; // FREE | PERCENT | FIXED
  value: number;
  productId?: string | null;
  productCode?: string | null;
};

export type CartItem = {
  productId: string;
  qty: number;
  price: number;
  code: string | null;
};

// Urutan tetap tiap jenis diterapkan - FREE duluan (selalu terikat 1 produk)
// baru PERCENT lalu FIXED, supaya voucher khusus produk motong duluan dan
// voucher umum baru menghitung dari SISA setelah itu (bukan dari harga
// asli - biar potongan gak dobel/lebih dari subtotal).
const TYPE_ORDER: Record<string, number> = { FREE: 0, PERCENT: 1, FIXED: 2 };

export type VoucherApplyResult = {
  total: number; // total potongan semua voucher
  perLine: Map<string, number>; // scope key (kode/id) → potongan di baris itu
  perVoucher: Map<string, number>; // voucher code → potongan yg disumbang voucher itu
};

// Terapkan sampai beberapa voucher SEKALIGUS (maks 1 per jenis - divalidasi
// di pemanggil) secara berurutan: tiap voucher motong dari SISA harga tiap
// baris (bukan dari harga asli), jadi voucher berikutnya otomatis kebagian
// sisa yang belum kepotong punya voucher sebelumnya. Dipakai server
// (validasi final) dan client (preview form) - rumus harus identik.
export function applyVouchers(
  vouchers: VoucherLike[],
  items: CartItem[],
): VoucherApplyResult {
  const remaining = new Map<string, number>();
  for (const i of items) {
    const key = voucherScopeKey({ id: i.productId, code: i.code });
    remaining.set(key, (remaining.get(key) ?? 0) + i.qty * i.price);
  }
  const unitPrice = new Map<string, number>();
  for (const i of items) {
    const key = voucherScopeKey({ id: i.productId, code: i.code });
    if (!unitPrice.has(key)) unitPrice.set(key, i.price);
  }

  const perLine = new Map<string, number>();
  const perVoucher = new Map<string, number>();
  let total = 0;

  const ordered = [...vouchers].sort(
    (a, b) => (TYPE_ORDER[a.type] ?? 9) - (TYPE_ORDER[b.type] ?? 9),
  );

  for (const v of ordered) {
    const scopeKey = v.productId
      ? voucherScopeKey({ id: v.productId, code: v.productCode ?? null })
      : null;
    let cut = 0;
    if (scopeKey) {
      const left = remaining.get(scopeKey) ?? 0;
      if (v.type === "FREE") {
        cut = Math.max(0, Math.min(unitPrice.get(scopeKey) ?? 0, left));
      } else if (v.type === "PERCENT") {
        cut = Math.max(0, Math.min(Math.floor((left * v.value) / 100), left));
      } else {
        cut = Math.max(0, Math.min(v.value, left));
      }
      remaining.set(scopeKey, left - cut);
      perLine.set(scopeKey, (perLine.get(scopeKey) ?? 0) + cut);
    } else {
      // Voucher umum (semua produk): basis = sisa SELURUH keranjang saat
      // ini, dibagi proporsional ke tiap baris (buat preview per-baris).
      const pool = [...remaining.values()].reduce((a, b) => a + b, 0);
      if (v.type === "PERCENT") {
        cut = Math.max(0, Math.min(Math.floor((pool * v.value) / 100), pool));
      } else if (v.type === "FIXED") {
        cut = Math.max(0, Math.min(v.value, pool));
      } else {
        cut = pool; // FREE tanpa scope (jarang - selalu wajib productId)
      }
      let sisa = cut;
      const keys = [...remaining.keys()];
      keys.forEach((key, idx) => {
        const left = remaining.get(key) ?? 0;
        if (left <= 0) return;
        const share =
          idx === keys.length - 1
            ? Math.min(sisa, left)
            : Math.min(left, Math.floor((cut * left) / (pool || 1)));
        sisa -= share;
        remaining.set(key, left - share);
        perLine.set(key, (perLine.get(key) ?? 0) + share);
      });
    }
    perVoucher.set(v.code, cut);
    total += cut;
  }

  return { total, perLine, perVoucher };
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

// Label singkat nilai voucher, mis. "10%", "Rp10.000", atau "Gratis"
export function voucherLabel(v: { type: string; value: number }): string {
  if (v.type === "FREE") return "Gratis";
  return v.type === "PERCENT"
    ? `${v.value}%`
    : new Intl.NumberFormat("id-ID", {
        style: "currency",
        currency: "IDR",
        maximumFractionDigits: 0,
      }).format(v.value);
}
