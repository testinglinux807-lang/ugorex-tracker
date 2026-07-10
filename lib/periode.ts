// Filter periode omzet & komisi di halaman Performa Sales (?periode=).
// "minggu" = sejak Senin minggu berjalan, "bulan" = sejak tanggal 1 bulan
// berjalan, selain itu semua waktu.

export type Periode = "semua" | "minggu" | "bulan";

export function parsePeriode(raw: string | undefined): Periode {
  return raw === "minggu" || raw === "bulan" ? raw : "semua";
}

// Batas awal periode; null = tanpa batas (semua waktu)
export function periodeStart(p: Periode, now: Date = new Date()): Date | null {
  if (p === "minggu") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // mundur ke Senin
    return d;
  }
  if (p === "bulan") {
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }
  return null;
}

export const PERIODE_LABEL: Record<Periode, string> = {
  semua: "semua waktu",
  minggu: "minggu ini",
  bulan: "bulan ini",
};
