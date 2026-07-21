import "server-only";
import { after } from "next/server";
import { prisma } from "./prisma";

// Riwayat skor bulanan sales (tabel SalesMonthlyScore). Skor bulan berjalan
// dihitung live tiap render; bulan-bulan lampau diambil beku dari sini untuk
// rata-rata rolling 3 bulan (lib/sales-kpi-grade.ts computeLevel).
//
// period = "YYYY-MM" menurut kalender WIB (Asia/Jakarta).

export function wibPeriod(d: Date = new Date()): string {
  // en-CA => "2026-07-20"; ambil bagian tahun-bulan saja
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })
    .format(d)
    .slice(0, 7);
}

// Geser period "YYYY-MM" sebanyak delta bulan (boleh negatif).
export function periodShift(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const ID_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// "2026-07" → "Jul 2026"
export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return `${ID_MONTHS[m - 1]} ${y}`;
}

// Label rentang bulan yang dirata-rata (rolling window n bulan berakhir di
// `period`). n<=1 → satu bulan, mis. "Jul 2026"; >1 → "Mei–Jul 2026".
export function rollingRangeLabel(period: string, n: number): string {
  if (n <= 1) return periodLabel(period);
  const start = periodShift(period, -(n - 1));
  const [ys, ms] = start.split("-").map(Number);
  const [ye, me] = period.split("-").map(Number);
  const s = ID_MONTHS[ms - 1] + (ys !== ye ? ` ${ys}` : "");
  return `${s}–${ID_MONTHS[me - 1]} ${ye}`;
}

// "2026-07" → "Jul" (nama bulan pendek, tanpa tahun) — label bar chart.
export function periodMonthShort(period: string): string {
  const m = Number(period.split("-")[1]);
  return ID_MONTHS[m - 1] ?? period;
}

// Skor n bulan SEBELUM `period` + period-nya (terbaru dulu) — buat bar chart
// "Skor 3 Bulan" di beranda sales.
export async function getPriorScoreRows(
  salesId: string,
  period: string,
  n = 2,
): Promise<{ period: string; score: number }[]> {
  return prisma.salesMonthlyScore.findMany({
    where: {
      salesId,
      period: { lt: period, gte: periodShift(period, -(n + 2)) },
    },
    orderBy: { period: "desc" },
    take: n,
    select: { period: true, score: true },
  });
}

// Skor n bulan SEBELUM `period` untuk satu sales (terbaru dulu).
export async function getPriorScores(
  salesId: string,
  period: string,
  n = 2,
): Promise<number[]> {
  const rows = await prisma.salesMonthlyScore.findMany({
    where: {
      salesId,
      period: { lt: period, gte: periodShift(period, -(n + 2)) },
    },
    orderBy: { period: "desc" },
    take: n,
    select: { score: true },
  });
  return rows.map((r) => r.score);
}

// Versi batch untuk leaderboard: skor prior tiap sales sekaligus.
export async function getPriorScoresBatch(
  salesIds: string[],
  period: string,
  n = 2,
): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>();
  if (salesIds.length === 0) return map;
  const rows = await prisma.salesMonthlyScore.findMany({
    where: {
      salesId: { in: salesIds },
      period: { lt: period, gte: periodShift(period, -(n + 2)) },
    },
    orderBy: { period: "desc" },
    select: { salesId: true, score: true },
  });
  for (const r of rows) {
    const arr = map.get(r.salesId) ?? [];
    if (arr.length < n) {
      arr.push(r.score);
      map.set(r.salesId, arr);
    }
  }
  return map;
}

// Simpan/segarkan skor bulan berjalan SETELAH respons terkirim (tidak
// memblok render). Dedup: kalau nilai sama, tidak menulis (hemat write).
export function recordMonthlyScore(
  salesId: string,
  period: string,
  score: number,
) {
  after(async () => {
    try {
      const existing = await prisma.salesMonthlyScore.findUnique({
        where: { salesId_period: { salesId, period } },
        select: { score: true },
      });
      if (existing?.score === score) return;
      await prisma.salesMonthlyScore.upsert({
        where: { salesId_period: { salesId, period } },
        update: { score },
        create: { salesId, period, score },
      });
    } catch {
      // Snapshot bersifat best-effort; jangan ganggu request kalau gagal.
    }
  });
}
