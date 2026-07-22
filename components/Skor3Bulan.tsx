import { LineChart, TrendingDown } from "lucide-react";

// Kartu "Skor 3 Bulan" (beranda sales): bar skor 3 bulan terakhir + rata-rata
// + ambang naik level. Level dibaca dari rata-rata biar 1 bulan sepi tidak
// langsung menurunkan level/komisi.
export function Skor3Bulan({
  bars,
  windowSize,
  threshold,
  nextLevelName,
}: {
  bars: { label: string; score: number; current?: boolean }[];
  // Brp bulan TERAKHIR (dari kanan/terbaru) yang dipakai buat rata-rata
  // penentu level - harus sama persis dgn computeLevel (lib/sales-kpi-grade.ts:
  // [score, ...priorScores].slice(0, 3)). Bar di luar jendela ini cuma
  // riwayat, ditampilkan pudar & tidak ikut dihitung.
  windowSize: number;
  threshold: number | null; // skor minimum naik level; null = sudah puncak
  nextLevelName: string | null;
}) {
  const windowStart = Math.max(0, bars.length - windowSize);
  const windowBars = bars.slice(windowStart);
  const avg =
    windowBars.reduce((a, b) => a + b.score, 0) / (windowBars.length || 1);
  const avgLabel = avg.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sumStr = windowBars.map((b) => b.score).join(" + ");

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/20 text-brand-dark">
          <LineChart className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold">Skor 3 Bulan</h2>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        Level baca <b className="text-neutral-700">rata-rata 3 bulan</b> - 1
        bulan sepi nggak langsung nurunin level &amp; komisi.
      </p>

      {/* Bar chart — skala 0-100, garis putus-putus = ambang naik level.
          Bisa digeser ke samping (touch/trackpad) kalau bulannya banyak -
          urutan tetap lama → baru, jadi geser ke kanan buat lihat terkini. */}
      <div className="-mx-1 mt-5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="w-max min-w-full">
          <div className="relative h-32">
            {threshold != null && (
              <div
                className="absolute inset-x-0 border-t-2 border-dashed border-brand-dark/50"
                style={{ bottom: `${threshold}%` }}
              >
                <span className="absolute -top-2.5 right-0 rounded bg-brand px-1.5 text-[10px] font-semibold text-neutral-900">
                  naik {threshold}
                </span>
              </div>
            )}
            {/* Garis rata-rata (bulan yang dipakai penentu level) */}
            <div
              className="absolute inset-x-0 border-t-2 border-dotted border-neutral-400"
              style={{ bottom: `${avg}%` }}
            >
              <span className="absolute -top-2.5 left-0 rounded bg-neutral-700 px-1.5 text-[10px] font-semibold text-white">
                rata² {avgLabel}
              </span>
            </div>
            <div className="flex h-full items-end justify-center gap-5 sm:gap-8">
              {bars.map((b, i) => {
                const inWindow = i >= windowStart;
                return (
                  <div
                    key={i}
                    className={`flex h-full w-16 shrink-0 flex-col items-center justify-end sm:w-20 ${
                      inWindow ? "" : "opacity-40"
                    }`}
                  >
                    <span
                      className={`mb-1 text-sm font-semibold tabular-nums ${
                        b.current ? "text-neutral-900" : "text-neutral-400"
                      }`}
                    >
                      {b.score}
                    </span>
                    <div
                      className={`w-full rounded-t-lg ${
                        b.current ? "bg-brand" : "bg-neutral-200"
                      }`}
                      style={{ height: `${Math.max(4, Math.min(100, b.score))}%` }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-1.5 flex justify-center gap-5 border-t border-neutral-100 pt-1.5 sm:gap-8">
            {bars.map((b, i) => {
              const inWindow = i >= windowStart;
              return (
                <span
                  key={i}
                  className={`w-16 shrink-0 text-center text-xs sm:w-20 ${
                    inWindow
                      ? b.current
                        ? "font-semibold text-neutral-700"
                        : "text-neutral-500"
                      : "text-neutral-300"
                  }`}
                >
                  {b.label}
                </span>
              );
            })}
          </div>
        </div>
      </div>
      {bars.length > 3 && (
        <p className="mt-1 text-center text-[10px] text-neutral-400">
          Geser buat lihat riwayat bulan lain → bulan pudar cuma riwayat, ga
          ikut dihitung rata-rata
        </p>
      )}

      {/* Rincian rata-rata + syarat */}
      <div className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
        <p className="text-neutral-500">
          ({sumStr}) ÷ {windowBars.length} ={" "}
          <b className="text-neutral-800">{avgLabel}</b>
          {threshold != null ? (
            <>
              {" "}
              → butuh{" "}
              <b className="text-brand-dark">{threshold}</b> buat naik
              {nextLevelName ? ` ke ${nextLevelName}` : " level"}.
            </>
          ) : (
            " - kamu di level puncak."
          )}
        </p>
        <p className="flex items-start gap-1 text-xs text-neutral-400">
          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Turun level cuma kalau jeblok 2 bulan berturut - ada masa tenggang.
        </p>
      </div>
    </section>
  );
}
