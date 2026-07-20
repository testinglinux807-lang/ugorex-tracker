// Grade & level sales model MILESTONE per level (di-set admin). Admin isi
// target tiap KPI untuk Lv 2/3/4 (matrix). Sales naik ke level berikutnya
// kalau MEMENUHI SEMUA target level itu. Grade huruf ikut level. Level 1 =
// awal (tanpa syarat); level 5 (Sales Captain) diangkat admin manual.

export type KpiKey =
  | "omzet"
  | "konversi"
  | "seeding"
  | "closing"
  | "konsistensi";

// Bobot dipakai HANYA untuk menimbang progres (% menuju level berikutnya);
// syarat naik level tetap "penuhi semua target". unit utk format tampilan.
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
export type KpiTargets = Record<KpiKey, number>; // target satu level

// Jenjang level + grade huruf + benefit. Lv 1 titik awal (tanpa syarat),
// Lv 2-4 punya target (matrix admin). Lv 5 Sales Captain = diangkat admin.
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
    benefit: "Akses dasar — katalog & harga reseller Ugorex.",
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
    benefit: "Sales andalan — prioritas restock produk fast-moving.",
  },
  {
    level: 4,
    name: "Top Performer",
    grade: "A",
    benefit: "Top performer tim — akses produk baru duluan & bonus.",
  },
];

// Level yang punya target (bisa diatur admin di matrix)
export const TARGET_LEVELS = [2, 3, 4] as const;

// Default target tiap level — makin tinggi level makin berat
export const DEFAULT_LEVEL_TARGETS: Record<number, KpiTargets> = {
  2: { omzet: 1_000_000, konversi: 50, seeding: 1, closing: 50, konsistensi: 6 },
  3: { omzet: 3_000_000, konversi: 70, seeding: 3, closing: 70, konsistensi: 12 },
  4: { omzet: 6_000_000, konversi: 85, seeding: 6, closing: 85, konsistensi: 18 },
};

export type Milestone = {
  key: KpiKey;
  label: string;
  unit: "rp" | "pct" | "count" | "day";
  value: number;
  target: number;
  done: boolean;
  pct: number; // 0-100 progres ke target level berikutnya
  hint: string;
};

export type LevelResult = {
  level: number;
  levelName: string;
  grade: string;
  captain: boolean;
  nextLevel: number | null;
  nextLevelName: string | null;
  nextTargets: KpiTargets | null;
  progress: number; // 0-100 tertimbang menuju level berikutnya
  milestones: Milestone[]; // syarat ke level berikutnya (kosong kalau puncak)
  doneCount: number;
};

// Tentukan level dari nilai KPI vs matrix target. Naik ke level L kalau
// SEMUA target level itu terpenuhi (berurutan dari 2). captainArea = Lv 5.
export function computeLevel(
  values: KpiValues,
  matrix: Record<number, KpiTargets>,
  captainArea?: string | null,
): LevelResult {
  const meetsAll = (t: KpiTargets) =>
    KPI_COMPONENTS.every((c) => (values[c.key] ?? 0) >= (t[c.key] ?? 0));

  if (captainArea) {
    return {
      level: 5,
      levelName: "Sales Captain",
      grade: "S",
      captain: true,
      nextLevel: null,
      nextLevelName: null,
      nextTargets: null,
      progress: 100,
      milestones: [],
      doneCount: 0,
    };
  }

  let level = 1;
  for (const L of TARGET_LEVELS) {
    if (matrix[L] && meetsAll(matrix[L])) level = L;
    else break;
  }
  const info = LEVELS.find((l) => l.level === level)!;
  const nextLevel = level < 4 ? level + 1 : null;
  const nextTargets = nextLevel ? matrix[nextLevel] : null;
  const nextInfo = nextLevel ? LEVELS.find((l) => l.level === nextLevel)! : null;

  let progress = 100;
  let milestones: Milestone[] = [];
  if (nextTargets) {
    milestones = KPI_COMPONENTS.map((c) => {
      const value = Math.max(0, values[c.key] ?? 0);
      const target = nextTargets[c.key] ?? 0;
      const pct = target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 100;
      return {
        key: c.key,
        label: c.label,
        unit: c.unit,
        value,
        target,
        done: value >= target,
        pct,
        hint: c.hint,
      };
    });
    const totalW = KPI_COMPONENTS.reduce((a, c) => a + c.weight, 0);
    progress = Math.round(
      milestones.reduce((a, m, i) => a + m.pct * KPI_COMPONENTS[i].weight, 0) /
        totalW,
    );
  }

  return {
    level,
    levelName: info.name,
    grade: info.grade,
    captain: false,
    nextLevel,
    nextLevelName: nextInfo?.name ?? null,
    nextTargets,
    progress,
    milestones,
    doneCount: milestones.filter((m) => m.done).length,
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
