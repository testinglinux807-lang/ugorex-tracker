// Grade & level sales model SKOR TERTIMBANG + rata-rata rolling 3 bulan.
// Tiap KPI dibanding SATU target ("bulan ideal") jadi rasio 0-1, dikali
// bobot, dijumlah jadi skor 0-100 bulan itu. Grade huruf & level diambil
// dari RATA-RATA skor 3 bulan terakhir yang tersedia (biar nggak bisa naik
// cuma modal 1 bulan gacor). Level 5 (Sales Captain) diangkat admin manual.
//
//   Tahap 1  rasio   = min(1, nilai / target)         (0-1, cap 100%)
//   Tahap 2  poin    = rasio × bobot                  (bobot total = 100)
//   Tahap 3  skor    = Σ poin                          (0-100 bulan ini)
//   Tahap 4  grade   = band dari rata-rata 3 bulan     (lihat LEVEL_MIN)

export type KpiKey =
  | "omzet"
  | "konversi"
  | "seeding"
  | "closing"
  | "konsistensi";

// Bobot tiap KPI dalam skor 0-100 (total = 100). Omzet paling besar karena
// ujung tujuan bisnis; konsistensi paling kecil (pendukung).
export const KPI_COMPONENTS: {
  key: KpiKey;
  label: string;
  weight: number;
  unit: "rp" | "pct" | "count" | "day";
  hint: string;
}[] = [
  {
    key: "omzet",
    label: "Omzet penjualan",
    weight: 30,
    unit: "rp",
    hint: "Total order restok lunas dari konter-mu bulan ini.",
  },
  {
    key: "konversi",
    label: "Konversi reorder",
    weight: 25,
    unit: "pct",
    hint: "Porsi konter pegangan yang reorder bulan ini.",
  },
  {
    key: "seeding",
    label: "Seeding konter baru",
    weight: 20,
    unit: "count",
    hint: "Jumlah konter baru yang kamu buka bulan ini.",
  },
  {
    key: "closing",
    label: "Rasio closing prospek",
    weight: 15,
    unit: "pct",
    hint: "Porsi prospek yang closing (tahap Conversion ke atas).",
  },
  {
    key: "konsistensi",
    label: "Konsistensi aktif",
    weight: 10,
    unit: "day",
    hint: "Jumlah hari kamu mencatat kunjungan/update konter bulan ini.",
  },
];

export type KpiValues = Record<KpiKey, number>;
export type KpiTargets = Record<KpiKey, number>; // satu set target "bulan ideal"

// Jenjang level + grade huruf + benefit. Lv 1-4 otomatis dari band skor,
// Lv 5 Sales Captain = diangkat admin (grade S).
export const LEVELS: {
  level: number;
  name: string;
  grade: string;
  benefit: string;
}[] = [
  {
    level: 1,
    name: "Trainee",
    grade: "D",
    benefit: "Akses dasar - katalog & harga reseller Ugorex.",
  },
  {
    level: 2,
    name: "Sales",
    grade: "C",
    benefit: "Bisa seeding konter baru & dapat komisi tiap reorder.",
  },
  {
    level: 3,
    name: "Sales Expert",
    grade: "B",
    benefit: "Sales andalan - prioritas restock produk fast-moving.",
  },
  {
    level: 4,
    name: "Top Performer",
    grade: "A",
    benefit: "Top performer tim - akses produk baru duluan & bonus.",
  },
];

// Ambang RATA-RATA skor (0-100) minimum tiap level. Grade huruf ikut level.
//   0-24  D  Lv.1 Trainee
//   25-54 C  Lv.2 Sales
//   55-79 B  Lv.3 Sales Expert
//   80+   A  Lv.4 Top Performer
export const LEVEL_MIN: Record<number, number> = { 1: 0, 2: 25, 3: 55, 4: 80 };
const BAND_LEVELS = [2, 3, 4] as const;

// Satu set target default ("bulan ideal") — dipakai kalau admin belum set.
export const DEFAULT_TARGETS: KpiTargets = {
  omzet: 3_000_000,
  konversi: 75,
  seeding: 3,
  closing: 85,
  konsistensi: 12,
};

export type Milestone = {
  key: KpiKey;
  label: string;
  unit: "rp" | "pct" | "count" | "day";
  value: number;
  target: number;
  done: boolean;
  ratio: number; // 0-1 (nilai/target, cap 1)
  pct: number; // 0-100 (= ratio × 100), untuk bar progres
  weight: number; // bobot komponen di skor
  points: number; // poin disumbang ke skor (ratio × weight, 1 desimal)
  hint: string;
};

export type LevelResult = {
  level: number;
  levelName: string;
  grade: string;
  captain: boolean;
  score: number; // skor bulan ini (0-100)
  avgScore: number; // rata-rata rolling — grade/level dihitung dari ini
  monthsUsed: number; // berapa bulan dipakai untuk rata-rata (1-3)
  nextLevel: number | null;
  nextLevelName: string | null;
  nextThreshold: number | null; // skor rata-rata minimum untuk naik level
  nextTargets: KpiTargets | null; // = target set (bahan coach/strategi)
  progress: number; // 0-100 posisi avgScore menuju ambang level berikutnya
  milestones: Milestone[]; // rincian per-KPI (kontribusi skor)
  doneCount: number; // berapa KPI sudah tembus targetnya
};

// Tahap 1-3: hitung skor 0-100 satu bulan dari nilai KPI vs target.
export function scoreMonth(
  values: KpiValues,
  targets: KpiTargets,
): { score: number; milestones: Milestone[] } {
  let total = 0;
  const milestones = KPI_COMPONENTS.map((c) => {
    const value = Math.max(0, values[c.key] ?? 0);
    const target = targets[c.key] ?? 0;
    const ratio = target > 0 ? Math.min(1, value / target) : 1;
    const points = ratio * c.weight;
    total += points;
    return {
      key: c.key,
      label: c.label,
      unit: c.unit,
      value,
      target,
      done: value >= target,
      ratio,
      pct: Math.round(ratio * 100),
      weight: c.weight,
      points: Math.round(points * 10) / 10,
      hint: c.hint,
    };
  });
  return { score: Math.round(total), milestones };
}

// Band level/grade dari sebuah skor rata-rata.
export function bandFromScore(avg: number): {
  level: number;
  name: string;
  grade: string;
} {
  let level = 1;
  for (const L of BAND_LEVELS) if (avg >= LEVEL_MIN[L]) level = L;
  const info = LEVELS.find((l) => l.level === level)!;
  return { level, name: info.name, grade: info.grade };
}

// Tahap 4: gabung skor bulan ini dengan skor bulan-bulan sebelumnya
// (paling banyak 2, terbaru dulu) → rata-rata → band grade/level.
export function computeLevel(
  values: KpiValues,
  targets: KpiTargets,
  captainArea?: string | null,
  priorScores: number[] = [],
): LevelResult {
  const { score, milestones } = scoreMonth(values, targets);
  const doneCount = milestones.filter((m) => m.done).length;

  if (captainArea) {
    return {
      level: 5,
      levelName: "Sales Captain",
      grade: "S",
      captain: true,
      score,
      avgScore: score,
      monthsUsed: 1,
      nextLevel: null,
      nextLevelName: null,
      nextThreshold: null,
      nextTargets: targets,
      progress: 100,
      milestones,
      doneCount,
    };
  }

  // Rata-rata skor: bulan ini + maksimal 2 bulan sebelumnya
  const window = [score, ...priorScores].slice(0, 3);
  const avgScore = Math.round(
    window.reduce((a, b) => a + b, 0) / window.length,
  );

  const band = bandFromScore(avgScore);
  const nextLevel = band.level < 4 ? band.level + 1 : null;
  const nextInfo = nextLevel ? LEVELS.find((l) => l.level === nextLevel)! : null;
  const nextThreshold = nextLevel ? LEVEL_MIN[nextLevel] : null;

  const curMin = LEVEL_MIN[band.level];
  const progress =
    nextThreshold != null
      ? Math.max(
          0,
          Math.min(
            100,
            Math.round(((avgScore - curMin) / (nextThreshold - curMin)) * 100),
          ),
        )
      : 100;

  return {
    level: band.level,
    levelName: band.name,
    grade: band.grade,
    captain: false,
    score,
    avgScore,
    monthsUsed: window.length,
    nextLevel,
    nextLevelName: nextInfo?.name ?? null,
    nextThreshold,
    nextTargets: targets,
    progress,
    milestones,
    doneCount,
  };
}

// Format nilai/target sesuai satuan komponen — dipakai UI.
export function fmtKpi(n: number, unit: Milestone["unit"]): string {
  if (unit === "rp") {
    if (n >= 1_000_000)
      return `Rp${(n / 1_000_000).toLocaleString("id-ID", { maximumFractionDigits: 1 })}jt`;
    if (n >= 1000) return `Rp${Math.round(n / 1000)}rb`;
    return `Rp${n.toLocaleString("id-ID")}`;
  }
  if (unit === "pct") return `${Math.round(n)}%`;
  if (unit === "day") return `${Math.round(n)} hari`;
  return `${n.toLocaleString("id-ID")}`;
}
