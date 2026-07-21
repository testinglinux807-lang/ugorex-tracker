// Helper tanggal terkunci ke zona WIB (Asia/Jakarta).
// Penting untuk render di SERVER: Vercel jalan di UTC, jadi tanpa timeZone
// eksplisit tanggal bisa mundur sehari untuk order dini hari WIB (mis. co
// jam 6 pagi WIB = 23:00 UTC hari sebelumnya → tampil tanggal kemarin).

const TZ = "Asia/Jakarta";

// Format tanggal ala toLocaleDateString id-ID, tapi selalu di zona WIB.
export function fmtDate(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
): string {
  return new Date(date).toLocaleDateString("id-ID", { ...opts, timeZone: TZ });
}

// Tanggal + hari + jam sekaligus (mis. "Minggu, 19 Jul 2026 14.30") — WIB.
export function fmtDateTime(
  date: Date | string | number,
  opts: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  },
): string {
  return new Date(date).toLocaleString("id-ID", { ...opts, timeZone: TZ });
}

// Awal hari ini (00:00 WIB) sebagai instant UTC — untuk bucketing "hari ini".
export function wibDayStart(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // "2026-07-06"
  return new Date(`${ymd}T00:00:00+07:00`);
}

// Awal bulan ini (tanggal 1, 00:00 WIB) sebagai instant UTC.
export function wibMonthStart(now: Date = new Date()): Date {
  const ym = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
  }).format(now); // "2026-07"
  return new Date(`${ym}-01T00:00:00+07:00`);
}

// Awal bulan (00:00 WIB) dari period "YYYY-MM" — kebalikan dari wibPeriod().
export function periodMonthStart(period: string): Date {
  return new Date(`${period}-01T00:00:00+07:00`);
}
