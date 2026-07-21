// Util geospasial: point-in-polygon + agregasi minat per kecamatan +
// jarak haversine (penugasan order ke gudang terdekat).

// Jarak dua titik lat/long dalam kilometer (haversine).
export function haversineKm(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const R = 6371; // radius bumi (km)
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.min(1, Math.sqrt(s)));
}

function inRing(pt: [number, number], ring: number[][]) {
  let inside = false;
  const [x, y] = pt;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1],
      xj = ring[j][0],
      yj = ring[j][1];
    const intersect =
      yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function inGeom(
  pt: [number, number],
  g: { type: string; coordinates: unknown },
): boolean {
  if (g.type === "Polygon") {
    const c = g.coordinates as number[][][];
    if (!inRing(pt, c[0])) return false;
    for (let k = 1; k < c.length; k++) if (inRing(pt, c[k])) return false;
    return true;
  }
  if (g.type === "MultiPolygon") {
    const mc = g.coordinates as number[][][][];
    for (const poly of mc) {
      if (inRing(pt, poly[0])) {
        let hole = false;
        for (let k = 1; k < poly.length; k++)
          if (inRing(pt, poly[k])) hole = true;
        if (!hole) return true;
      }
    }
    return false;
  }
  return false;
}

// 5 tingkat zona minat (hijau = potensial → merah = zona mati)
export type Tier = { min: number; label: string; color: string };
export const INTEREST_TIERS: Tier[] = [
  { min: 0.8, label: "Sangat Potensial", color: "#15803d" }, // hijau tua
  { min: 0.6, label: "Potensial", color: "#84cc16" }, // lime
  { min: 0.4, label: "Sedang", color: "#eab308" }, // kuning
  { min: 0.2, label: "Rendah", color: "#f97316" }, // oranye
  { min: 0, label: "Zona Merah", color: "#dc2626" }, // merah
];

export function interestTier(score: number): Tier {
  return (
    INTEREST_TIERS.find((t) => score >= t.min) ??
    INTEREST_TIERS[INTEREST_TIERS.length - 1]
  );
}

export type GeoPoint = { lat: number; lng: number; result: string };
export type KecStat = {
  name: string;
  pos: number;
  neg: number;
  neu: number;
  total: number;
  score: number; // (pos + 0.5*neu) / total — 0 (merah) .. 1 (hijau)
};

type KecFeature = {
  properties?: { name?: string } | null;
  geometry?: { type: string; coordinates: unknown };
};

// Agregasi tiap titik (konter) ke kecamatan yang memuatnya, lalu hitung skor minat
export function rankKecamatan(
  points: GeoPoint[],
  features: KecFeature[],
): KecStat[] {
  const m = new Map<string, { pos: number; neg: number; neu: number }>();
  for (const p of points) {
    const f = features.find((ft) =>
      ft.geometry ? inGeom([p.lng, p.lat], ft.geometry) : false,
    );
    if (!f) continue;
    const name = f.properties?.name ?? "";
    const rec = m.get(name) ?? { pos: 0, neg: 0, neu: 0 };
    if (p.result === "POSITIVE") rec.pos++;
    else if (p.result === "REJECTED") rec.neg++;
    else rec.neu++;
    m.set(name, rec);
  }
  const arr: KecStat[] = [...m.entries()].map(([name, r]) => {
    const total = r.pos + r.neg + r.neu;
    return {
      name,
      pos: r.pos,
      neg: r.neg,
      neu: r.neu,
      total,
      score: total > 0 ? (r.pos + 0.5 * r.neu) / total : 0,
    };
  });
  // Urut: skor tertinggi → jumlah tertarik → total
  arr.sort((a, b) => b.score - a.score || b.pos - a.pos || b.total - a.total);
  return arr;
}
