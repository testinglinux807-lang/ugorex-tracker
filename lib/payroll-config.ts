import "server-only";
import { prisma } from "./prisma";
import { PAYROLL_DEFAULTS, type PayrollConfig } from "./payroll";

// Setelan payroll (tarif lembur, bonus KPI, ambang skor) disimpan di Config
// (key-value): key = `payroll_{field}`. Admin mengaturnya di halaman Payroll.
const KEYS = {
  lemburTarif: "payroll_lembur_tarif",
  bonusKpi: "payroll_bonus_kpi",
  kpiMin: "payroll_kpi_min",
} as const;

export { KEYS as PAYROLL_KEYS };

export async function getPayrollConfig(): Promise<PayrollConfig> {
  const rows = await prisma.config.findMany({
    where: { key: { in: Object.values(KEYS) } },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const num = (key: string, def: number) => {
    const raw = m.get(key);
    const n = raw != null ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : def;
  };
  return {
    lemburTarif: num(KEYS.lemburTarif, PAYROLL_DEFAULTS.lemburTarif),
    bonusKpi: num(KEYS.bonusKpi, PAYROLL_DEFAULTS.bonusKpi),
    kpiMin: num(KEYS.kpiMin, PAYROLL_DEFAULTS.kpiMin),
  };
}
