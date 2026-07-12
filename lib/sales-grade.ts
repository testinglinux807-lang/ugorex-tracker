// Grade huruf (S+, S, A, B, C, D, E) untuk leveling sales — tampil di
// Performa Sales & detail sales (admin) dan Beranda (sales sendiri).
// Skor 0-100 dari 4 komponen. Seperti grade tugas (lib/task-grade.ts),
// aturannya sengaja transparan supaya sales tahu cara nilainya naik:
//   - Omzet  (35) : omzet semua waktu dibanding sales terbaik di tim —
//                   pakai akar kuadrat supaya selisih omzet besar tidak
//                   terlalu menghukum sales di bawahnya
//   - Loyal  (25) : porsi konter yang mencapai tahap Loyalty
//   - Aktif  (20) : porsi konter yang tidak terbengkalai (>30 hari diam)
//   - Tugas  (20) : grade KPI tugas admin (0-5 bintang) diskalakan
// Komponen tanpa data (belum pegang konter / belum ada tugas dinilai /
// belum ada omzet di tim) tidak dihitung — skor diskalakan ulang dari
// komponen yang ada. Tanpa data sama sekali = belum punya grade.

export const GRADES = ["S+", "S", "A", "B", "C", "D", "E"] as const;
export type Grade = (typeof GRADES)[number];

// Ambang skor minimum tiap grade (dicek berurutan dari S+)
export const GRADE_MIN: Record<Grade, number> = {
  "S+": 90,
  S: 80,
  A: 70,
  B: 55,
  C: 40,
  D: 25,
  E: 0,
};

export const GRADE_DESC: Record<Grade, string> = {
  "S+": "Luar biasa — unggul di hampir semua komponen",
  S: "Sangat baik",
  A: "Baik",
  B: "Cukup",
  C: "Perlu ditingkatkan",
  D: "Kurang",
  E: "Butuh perhatian",
};

// Warna badge — monokrom makin gelap makin tinggi; S+ pakai lime brand,
// E merah pudar sebagai tanda butuh perhatian (senada badge "Penting").
export const GRADE_HEX: Record<Grade, string> = {
  "S+": "#d2ec0a",
  S: "#171717",
  A: "#404040",
  B: "#737373",
  C: "#a3a3a3",
  D: "#e5e5e5",
  E: "#fee2e2",
};

export const GRADE_ON: Record<Grade, string> = {
  "S+": "#171717",
  S: "#d2ec0a",
  A: "#ffffff",
  B: "#ffffff",
  C: "#ffffff",
  D: "#525252",
  E: "#b91c1c",
};

export type SalesGradeInput = {
  revenue: number; // omzet semua waktu sales ini
  maxRevenue: number; // omzet semua waktu tertinggi di antara semua sales
  konter: number; // jumlah konter yang dipegang
  loyal: number; // konter yang mencapai tahap Loyalty
  terbengkalai: number; // konter >30 hari tanpa aktivitas
  stars: number | null; // grade KPI tugas 0-5; null = belum ada tugas dinilai
};

export type GradePart = {
  key: "omzet" | "loyal" | "aktif" | "tugas";
  label: string;
  earned: number; // poin didapat (1 desimal)
  max: number; // bobot maksimal komponen
};

export type SalesGradeResult = {
  grade: Grade | null; // null = belum ada data yang bisa dinilai
  score: number | null; // 0-100, bulat
  parts: GradePart[]; // hanya komponen yang punya data
};

const round1 = (n: number) => Math.round(n * 10) / 10;

export function salesGrade(i: SalesGradeInput): SalesGradeResult {
  const parts: GradePart[] = [];

  if (i.maxRevenue > 0) {
    const ratio = Math.min(1, Math.max(0, i.revenue) / i.maxRevenue);
    parts.push({
      key: "omzet",
      label: "Omzet",
      earned: round1(35 * Math.sqrt(ratio)),
      max: 35,
    });
  }
  if (i.konter > 0) {
    parts.push({
      key: "loyal",
      label: "Konter Loyal",
      earned: round1(25 * (i.loyal / i.konter)),
      max: 25,
    });
    parts.push({
      key: "aktif",
      label: "Keaktifan",
      earned: round1(20 * ((i.konter - i.terbengkalai) / i.konter)),
      max: 20,
    });
  }
  if (i.stars !== null) {
    parts.push({
      key: "tugas",
      label: "Tugas",
      earned: round1(20 * (i.stars / 5)),
      max: 20,
    });
  }

  const possible = parts.reduce((a, p) => a + p.max, 0);
  if (possible === 0) return { grade: null, score: null, parts };

  const earned = parts.reduce((a, p) => a + p.earned, 0);
  const score = Math.round((earned / possible) * 100);
  const grade = GRADES.find((g) => score >= GRADE_MIN[g]) ?? "E";
  return { grade, score, parts };
}

// ===== Level sales (jenjang karir 1-5) di atas grade huruf =====
// Level 1-4 otomatis dari grade; naik/turun mengikuti skor. Level 5
// "Sales Captain" rahasia — tidak pernah muncul sebagai jenjang berikutnya,
// hanya aktif kalau admin mengangkat sales jadi kepala sales sebuah wilayah
// (User.captainArea; terbatas satu captain per wilayah).
//   Lv 1 Trainee        : grade D/E atau belum punya grade
//   Lv 2 Sales          : grade C/B
//   Lv 3 Sales Expert   : grade A
//   Lv 4 Top Performer  : grade S/S+
//   Lv 5 Sales Captain  : diangkat admin (per wilayah, opsional & terbatas)

export type SalesLevel = {
  level: 1 | 2 | 3 | 4 | 5;
  name: string;
  next: string | null; // syarat naik level; null = sudah puncak jenjang biasa
};

export function salesLevel(
  grade: Grade | null,
  captainArea?: string | null,
): SalesLevel {
  if (captainArea) return { level: 5, name: "Sales Captain", next: null };
  if (grade === "S+" || grade === "S")
    return { level: 4, name: "Top Performer", next: null };
  if (grade === "A")
    return {
      level: 3,
      name: "Sales Expert",
      next: "Capai grade S untuk jadi Top Performer",
    };
  if (grade === "B" || grade === "C")
    return {
      level: 2,
      name: "Sales",
      next: "Capai grade A untuk jadi Sales Expert",
    };
  return {
    level: 1,
    name: "Trainee",
    next: "Capai grade C untuk naik ke level Sales",
  };
}

// Rincian satu baris, mis. "Omzet 24,7/35 · Konter Loyal 12,5/25 · …"
export function gradePartsSummary(parts: GradePart[]): string {
  return parts
    .map((p) => `${p.label} ${p.earned.toLocaleString("id-ID")}/${p.max}`)
    .join(" · ");
}
