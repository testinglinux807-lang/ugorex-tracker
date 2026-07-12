// 4 KPI operasional per sales, dihitung per jendela waktu (dipakai bulan
// berjalan WIB, pembanding bulan lalu). Mengikuti model simulasi bisnis:
//   - Seeding   : konter baru yang dibuka di jendela ini
//   - Konversi  : % konter pegangan yang "aktif" = reorder (order restok
//                 lunas) di jendela ini
//   - Reorder   : rata-rata pcs keluar per konter aktif
//   - Harga     : harga jual rata-rata per pcs dari transaksi POS
// Grade huruf & level TIDAK memakai angka ini (lihat lib/sales-grade.ts) —
// KPI ini murni alat pantau di Performa Sales, detail sales, dan beranda.

export type KpiWindow = { from: Date; to: Date | null }; // to null = sekarang

export type SalesKpiInput = {
  stores: { id: string; createdAt: Date }[]; // konter pegangan sales saat ini
  orders: { storeId: string; createdAt: Date; pcs: number }[]; // order restok LUNAS
  sales: { storeId: string; createdAt: Date; qty: number; total: number }[]; // transaksi POS
};

export type SalesKpi = {
  seeding: number; // konter baru
  aktif: number; // konter yang reorder
  konversi: number | null; // % aktif dari total pegangan; null = belum pegang konter
  reorder: number | null; // pcs per konter aktif; null = belum ada yang aktif
  harga: number | null; // Rp per pcs; null = belum ada penjualan POS
};

export function salesKpi(i: SalesKpiInput, w: KpiWindow): SalesKpi {
  const inWindow = (d: Date) =>
    d >= w.from && (w.to === null || d < w.to);
  const storeIds = new Set(i.stores.map((s) => s.id));

  const seeding = i.stores.filter((s) => inWindow(s.createdAt)).length;

  const aktifSet = new Set<string>();
  let pcs = 0;
  for (const o of i.orders) {
    if (!storeIds.has(o.storeId) || !inWindow(o.createdAt)) continue;
    aktifSet.add(o.storeId);
    pcs += o.pcs;
  }
  const aktif = aktifSet.size;

  let qty = 0;
  let omzet = 0;
  for (const s of i.sales) {
    if (!storeIds.has(s.storeId) || !inWindow(s.createdAt)) continue;
    qty += s.qty;
    omzet += s.total;
  }

  return {
    seeding,
    aktif,
    konversi:
      i.stores.length > 0 ? Math.round((aktif / i.stores.length) * 100) : null,
    reorder: aktif > 0 ? Math.round(pcs / aktif) : null,
    harga: qty > 0 ? Math.round(omzet / qty) : null,
  };
}
