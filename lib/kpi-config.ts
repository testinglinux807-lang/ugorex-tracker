import "server-only";
import { prisma } from "./prisma";
import {
  DEFAULT_TARGETS,
  KPI_COMPONENTS,
  type KpiTargets,
} from "./sales-kpi-grade";

// Satu set target KPI ("bulan ideal" = referensi skor 100%) disimpan di
// tabel Config (key-value): key = `kpi_target_{kpi}`. Admin mengaturnya di
// Performa Sales; kalau belum di-set, pakai default (DEFAULT_TARGETS).
export function kpiTargetKey(kpi: string) {
  return `kpi_target_${kpi}`;
}

export async function getScoreTargets(): Promise<KpiTargets> {
  const keys = KPI_COMPONENTS.map((c) => kpiTargetKey(c.key));
  const rows = await prisma.config.findMany({ where: { key: { in: keys } } });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const num = (kpi: string, def: number) => {
    const raw = m.get(kpiTargetKey(kpi));
    const n = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : def;
  };

  return {
    omzet: num("omzet", DEFAULT_TARGETS.omzet),
    konversi: num("konversi", DEFAULT_TARGETS.konversi),
    seeding: num("seeding", DEFAULT_TARGETS.seeding),
    closing: num("closing", DEFAULT_TARGETS.closing),
    konsistensi: num("konsistensi", DEFAULT_TARGETS.konsistensi),
  };
}
