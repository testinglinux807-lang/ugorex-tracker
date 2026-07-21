import { BarChart3, TrendingDown } from "lucide-react";

// Kartu "Skor 3 Bulan" (beranda sales): bar skor 3 bulan terakhir + rata-rata
// + ambang naik level. Level dibaca dari rata-rata biar 1 bulan sepi tidak
// langsung menurunkan level/komisi.
export function Skor3Bulan({
  bars,
  avg,
  threshold,
  nextLevelName,
}: {
  bars: { label: string; score: number; current?: boolean }[];
  avg: number; // rata-rata (desimal)
  threshold: number | null; // skor minimum naik level; null = sudah puncak
  nextLevelName: string | null;
}) {
  const avgLabel = avg.toLocaleString("id-ID", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  const sumStr = bars.map((b) => b.score).join(" + ");

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand/20 text-brand-dark">
          <BarChart3 className="h-4 w-4" />
        </span>
        <h2 className="text-base font-semibold">Skor 3 Bulan</h2>
      </div>
      <p className="mt-2 text-sm text-neutral-500">
        Level baca <b className="text-neutral-700">rata-rata 3 bulan</b> — 1
        bulan sepi nggak langsung nurunin level &amp; komisi.
      </p>

      {/* Bar chart — skala 0-100, garis putus-putus = ambang naik level */}
      <div className="mt-5">
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
          <div className="flex h-full items-end justify-center gap-5 sm:gap-8">
            {bars.map((b, i) => (
              <div
                key={i}
                className="flex h-full w-16 flex-col items-center justify-end sm:w-20"
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
            ))}
          </div>
        </div>
        <div className="mt-1.5 flex justify-center gap-5 border-t border-neutral-100 pt-1.5 sm:gap-8">
          {bars.map((b, i) => (
            <span
              key={i}
              className={`w-16 text-center text-xs sm:w-20 ${
                b.current ? "font-semibold text-neutral-700" : "text-neutral-400"
              }`}
            >
              {b.label}
            </span>
          ))}
        </div>
      </div>

      {/* Rincian rata-rata + syarat */}
      <div className="mt-4 space-y-1.5 rounded-xl bg-neutral-50 px-4 py-3 text-sm">
        <p className="text-neutral-500">
          ({sumStr}) ÷ {bars.length} ={" "}
          <b className="text-neutral-800">{avgLabel}</b>
          {threshold != null ? (
            <>
              {" "}
              → butuh{" "}
              <b className="text-brand-dark">{threshold}</b> buat naik
              {nextLevelName ? ` ke ${nextLevelName}` : " level"}.
            </>
          ) : (
            " — kamu di level puncak."
          )}
        </p>
        <p className="flex items-start gap-1 text-xs text-neutral-400">
          <TrendingDown className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Turun level cuma kalau jeblok 2 bulan berturut — ada masa tenggang.
        </p>
      </div>
    </section>
  );
}
