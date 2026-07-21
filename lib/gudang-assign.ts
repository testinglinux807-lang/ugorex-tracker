import "server-only";
import { prisma } from "./prisma";
import { haversineKm } from "./geo";

// Penugasan order ke GUDANG terdekat (menggantikan sistem klaim/rebutan).
// Dasar penugasan = jarak gudang ke SALES pemegang toko (sales yang pickup
// ke gudang). Toko harus dalam radius X km dari gudang; kalau lewat, order
// tetap ke gudang terdekat tapi ditandai "jauh".

export type GudangLoc = { id: string; name: string; lat: number; lng: number };

// Gudang yang punya koordinat (diisi admin saat buat akun).
export async function loadGudangLocs(): Promise<GudangLoc[]> {
  const rows = await prisma.user.findMany({
    where: { role: "GUDANG", homeLat: { not: null }, homeLng: { not: null } },
    select: { id: true, name: true, homeLat: true, homeLng: true },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    lat: r.homeLat!,
    lng: r.homeLng!,
  }));
}

export const GUDANG_RADIUS_KEY = "gudang_radius_km";
export const DEFAULT_RADIUS_KM = 5;

export async function getGudangRadiusKm(): Promise<number> {
  const row = await prisma.config.findUnique({
    where: { key: GUDANG_RADIUS_KEY },
  });
  const n = row ? Number(row.value) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RADIUS_KM;
}

export type Assignment = {
  gudangId: string;
  gudangName: string;
  salesDistKm: number; // jarak gudang ↔ sales (dasar penugasan)
  storeDistKm: number | null; // jarak gudang ↔ toko
  far: boolean; // toko di luar radius (atau toko tak berkoordinat)
};

type Pt = { lat: number; lng: number };

// ref = titik sales (dasar penugasan). store = titik toko (cek radius).
// Kalau sales tak berkoordinat, jatuh ke titik toko sebagai acuan.
export function assignGudang(
  ref: Pt | null,
  store: Pt | null,
  gudangs: GudangLoc[],
  radiusKm: number,
): Assignment | null {
  if (gudangs.length === 0) return null;
  const base = ref ?? store;
  if (!base) return null; // tak ada acuan sama sekali → tak bisa ditugaskan

  let best: { g: GudangLoc; d: number } | null = null;
  for (const g of gudangs) {
    const d = haversineKm(base.lat, base.lng, g.lat, g.lng);
    if (!best || d < best.d) best = { g, d };
  }
  const g = best!.g;
  const storeDist = store
    ? haversineKm(store.lat, store.lng, g.lat, g.lng)
    : null;
  return {
    gudangId: g.id,
    gudangName: g.name,
    salesDistKm: best!.d,
    storeDistKm: storeDist,
    far: storeDist == null ? true : storeDist > radiusKm,
  };
}

// Ambil titik acuan (sales & toko) dari order, lalu tugaskan.
export function assignForOrder(
  order: {
    store: {
      lat: number | null;
      lng: number | null;
      sales: { homeLat: number | null; homeLng: number | null } | null;
    };
  },
  gudangs: GudangLoc[],
  radiusKm: number,
): Assignment | null {
  const s = order.store.sales;
  const ref =
    s && s.homeLat != null && s.homeLng != null
      ? { lat: s.homeLat, lng: s.homeLng }
      : null;
  const store =
    order.store.lat != null && order.store.lng != null
      ? { lat: order.store.lat, lng: order.store.lng }
      : null;
  return assignGudang(ref, store, gudangs, radiusKm);
}
