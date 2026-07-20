import { STAGES, type Stage } from "./constants";
import type { KpiValues } from "./sales-kpi-grade";

// SATU SUMBER rumus 5 nilai KPI bulanan sales. Dipakai beranda, leaderboard
// /sales, detail /sales/[id], dan /tugas — supaya cara menghitung Omzet /
// Konversi / Seeding / Closing / Konsistensi persis sama di mana pun.
// Ubah rumus di sini = berlaku di semua halaman.
//
// Fungsi PURE (tanpa query): tiap halaman menyiapkan datanya sendiri
// (biar bisa scoped: 1 sales atau semua), lalu memanggil ini.
export function computeSalesKpiValues(args: {
  // Konter yang dipegang sales ini
  stores: { id: string; createdAt: Date }[];
  // Order restok LUNAS bulan ini (boleh semua sales — difilter per store)
  ordersMonth: { storeId: string; total: number }[];
  // Prospek (boleh semua — difilter per store milik sales ini)
  prospects: { storeId: string; stage: string }[];
  // Jumlah hari aktif (distinct hari WIB dari StageLog) bulan ini
  activeDays: number;
  // Awal bulan berjalan (WIB) untuk hitung seeding
  monthStart: Date;
}): KpiValues {
  const ids = new Set(args.stores.map((s) => s.id));

  // Omzet bulan ini + konter yang reorder (aktif)
  let omzet = 0;
  const active = new Set<string>();
  for (const o of args.ordersMonth) {
    if (!ids.has(o.storeId)) continue;
    omzet += o.total;
    active.add(o.storeId);
  }

  // Seeding = konter yang dibuat bulan ini
  const seeding = args.stores.filter((s) => s.createdAt >= args.monthStart).length;

  // Konversi = % konter pegangan yang reorder bulan ini
  const konversi =
    args.stores.length > 0
      ? Math.round((active.size / args.stores.length) * 100)
      : 0;

  // Closing = % prospek tahap Conversion ke atas
  const convIdx = STAGES.indexOf("CONVERSION");
  let won = 0;
  let total = 0;
  for (const p of args.prospects) {
    if (!ids.has(p.storeId)) continue;
    total++;
    if (STAGES.indexOf(p.stage as Stage) >= convIdx) won++;
  }
  const closing = total > 0 ? Math.round((won / total) * 100) : 0;

  return { omzet, konversi, seeding, closing, konsistensi: args.activeDays };
}

// Bangun map hari-aktif per sales dari StageLog (distinct hari WIB). Dipakai
// halaman yang menghitung banyak sales sekaligus (leaderboard, /tugas).
export function activeDaysBySalesFrom(
  logs: { salesId: string | null; createdAt: Date }[],
): Map<string, number> {
  const wibDay = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(d);
  const sets = new Map<string, Set<string>>();
  for (const l of logs) {
    if (!l.salesId) continue;
    const set = sets.get(l.salesId) ?? new Set<string>();
    set.add(wibDay(l.createdAt));
    sets.set(l.salesId, set);
  }
  const out = new Map<string, number>();
  for (const [id, set] of sets) out.set(id, set.size);
  return out;
}
