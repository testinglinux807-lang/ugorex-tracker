import "server-only";
import { prisma } from "./prisma";
import {
  DEFAULT_LEVEL_TARGETS,
  TARGET_LEVELS,
  KPI_COMPONENTS,
  type KpiTargets,
} from "./sales-kpi-grade";

// Target KPI per LEVEL (Lv 2/3/4 × 5 KPI) disimpan di tabel Config
// (key-value): key = `kpi_L{level}_{kpi}`. Admin mengaturnya di Performa
// Sales; kalau belum di-set, pakai default per level.
export function kpiKey(level: number, kpi: string) {
  return `kpi_L${level}_${kpi}`;
}

export async function getLevelTargets(): Promise<Record<number, KpiTargets>> {
  const keys: string[] = [];
  for (const L of TARGET_LEVELS)
    for (const c of KPI_COMPONENTS) keys.push(kpiKey(L, c.key));

  const rows = await prisma.config.findMany({ where: { key: { in: keys } } });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, def: number) => {
    const raw = m.get(key);
    const n = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : def;
  };

  const out: Record<number, KpiTargets> = {};
  for (const L of TARGET_LEVELS) {
    const def = DEFAULT_LEVEL_TARGETS[L];
    out[L] = {
      omzet: num(kpiKey(L, "omzet"), def.omzet),
      konversi: num(kpiKey(L, "konversi"), def.konversi),
      seeding: num(kpiKey(L, "seeding"), def.seeding),
      closing: num(kpiKey(L, "closing"), def.closing),
      konsistensi: num(kpiKey(L, "konsistensi"), def.konsistensi),
    };
  }
  return out;
}
