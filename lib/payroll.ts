// Rumus payroll (murni, tanpa query) — dipakai halaman /payroll (admin).
// Sales: komisi = omzet reorder × persen komisi per-sales (User.commissionPct,
// sama dengan yang dipakai payout & buku kas), + bonus KPI otomatis kalau
// skor grade rata-rata bulan itu >= ambang. Gudang: gaji pokok + upah lembur
// (jam × tarif) − potongan (telat + kasbon + absen), lembur & potongan
// dijumlah dari Log Harian.

// Potongan gaji gudang (dicatat admin). Lembur TIDAK di sini — pakai
// LemburSession (clock-in/out). Semua jenis di bawah mengurangi gaji.
export type PayrollLogType = "TELAT" | "KASBON" | "ABSEN";

export const LOG_TYPES: PayrollLogType[] = ["TELAT", "KASBON", "ABSEN"];

export const LOG_LABEL: Record<PayrollLogType, string> = {
  TELAT: "Telat",
  KASBON: "Kasbon",
  ABSEN: "Absen",
};

export function isPotongan(type: string): boolean {
  return type === "TELAT" || type === "KASBON" || type === "ABSEN";
}

// Jam lembur (desimal, 2 angka) dari sepasang timestamp. endAt null (sesi
// masih berjalan) → 0 (belum dihitung sampai clock-out).
export function sessionHours(startAt: Date, endAt: Date | null): number {
  if (!endAt) return 0;
  const ms = endAt.getTime() - startAt.getTime();
  if (ms <= 0) return 0;
  return Math.round((ms / 3_600_000) * 100) / 100;
}

export type PayrollConfig = {
  lemburTarif: number; // Rp per jam lembur
  bonusKpi: number; // Rp bonus kalau KPI tercapai
  kpiMin: number; // skor rata-rata minimum untuk "KPI tercapai"
};

export const PAYROLL_DEFAULTS: PayrollConfig = {
  lemburTarif: 100_000,
  bonusKpi: 500_000,
  kpiMin: 55,
};

export type SalesPayrollRow = {
  salesId: string;
  name: string;
  level: number;
  levelName: string;
  omzet: number; // omzet reorder (order restok lunas) bulan ini
  pct: number; // persen komisi (User.commissionPct)
  komisi: number;
  score: number | null; // skor grade rata-rata (rolling); null = belum ada
  kpiHit: boolean; // skor >= kpiMin
  bonus: number;
  total: number;
};

export function computeSalesPayroll(
  s: {
    salesId: string;
    name: string;
    level: number;
    levelName: string;
    omzet: number;
    pct: number;
    score: number | null;
  },
  cfg: PayrollConfig,
): SalesPayrollRow {
  const komisi = Math.round((s.omzet * s.pct) / 100);
  const kpiHit = s.score != null && s.score >= cfg.kpiMin;
  const bonus = kpiHit ? cfg.bonusKpi : 0;
  return {
    salesId: s.salesId,
    name: s.name,
    level: s.level,
    levelName: s.levelName,
    omzet: s.omzet,
    pct: s.pct,
    komisi,
    score: s.score,
    kpiHit,
    bonus,
    total: komisi + bonus,
  };
}

export type GudangPayrollRow = {
  userId: string;
  name: string;
  basePay: number;
  lemburJam: number; // total jam lembur (desimal) dari sesi bulan ini
  upahLembur: number;
  potongan: number;
  total: number;
};

export function computeGudangPayroll(
  e: { userId: string; name: string; basePay: number },
  lemburJam: number,
  potonganLogs: { type: string; amount: number }[],
  cfg: PayrollConfig,
): GudangPayrollRow {
  const potongan = potonganLogs.reduce(
    (s, l) => s + (isPotongan(l.type) ? l.amount : 0),
    0,
  );
  const upahLembur = Math.round(lemburJam * cfg.lemburTarif);
  return {
    userId: e.userId,
    name: e.name,
    basePay: e.basePay,
    lemburJam,
    upahLembur,
    potongan,
    total: e.basePay + upahLembur - potongan,
  };
}
