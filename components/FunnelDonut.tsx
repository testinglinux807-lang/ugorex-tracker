import {
  STAGES,
  STAGE_LABEL,
  STAGE_HEX,
  type Stage,
} from "@/lib/constants";

export function FunnelDonut({
  counts,
  total,
}: {
  counts: Record<Stage, number>;
  total: number;
}) {
  const size = 160;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const center = size / 2;

  // Hitung segmen donut
  let offset = 0;
  const segments = STAGES.map((s) => {
    const val = counts[s] ?? 0;
    const frac = total > 0 ? val / total : 0;
    const len = frac * c;
    const seg = { s, val, frac, len, offset };
    offset += len;
    return seg;
  });

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:justify-center sm:gap-6">
      {/* Donut */}
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          {/* Track kosong */}
          <circle
            cx={center}
            cy={center}
            r={r}
            fill="none"
            stroke="#f1f5f1"
            strokeWidth={stroke}
          />
          {total > 0 &&
            segments.map((seg) =>
              seg.len > 0 ? (
                <circle
                  key={seg.s}
                  cx={center}
                  cy={center}
                  r={r}
                  fill="none"
                  stroke={STAGE_HEX[seg.s]}
                  strokeWidth={stroke}
                  strokeDasharray={`${seg.len} ${c - seg.len}`}
                  strokeDashoffset={-seg.offset}
                />
              ) : null,
            )}
        </svg>
        {/* Angka di tengah */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-bold leading-none">{total}</span>
          <span className="text-xs text-neutral-500">Prospek</span>
        </div>
      </div>

      {/* Legend */}
      <div className="w-full sm:w-auto sm:min-w-[160px]">
        <p className="mb-2 text-xs font-medium text-neutral-500">
          POSISI SAAT INI
        </p>
        <ul className="space-y-2">
          {STAGES.map((s) => {
          const val = counts[s] ?? 0;
          const pct = total > 0 ? Math.round((val / total) * 100) : 0;
          return (
            <li key={s} className="flex items-center gap-2 text-sm">
              <span
                className="h-3 w-3 shrink-0 rounded-full"
                style={{ backgroundColor: STAGE_HEX[s] }}
              />
              <span className="flex-1 text-neutral-700">{STAGE_LABEL[s]}</span>
              <span className="font-semibold">{val}</span>
              <span className="w-10 text-right text-xs text-neutral-400">
                {pct}%
              </span>
            </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
