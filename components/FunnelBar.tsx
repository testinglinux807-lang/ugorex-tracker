import { STAGE_LABEL, type Stage } from "@/lib/constants";

export function FunnelBar({
  counts,
  total,
}: {
  counts: Record<Stage, number>;
  total: number;
}) {
  if (total === 0)
    return <p className="text-sm text-neutral-400">Belum ada data</p>;

  const stages: Stage[] = [
    "AWARENESS",
    "INTEREST",
    "DESIRE",
    "ACTION",
    "LOYALTY",
  ];

  return (
    <div className="space-y-3">
      {stages.map((stage) => {
        const value = counts[stage] || 0;
        const pct = total ? Math.round((value / total) * 100) : 0;
        return (
          <div key={stage} className="flex items-center gap-3 text-sm">
            <span className="w-20 shrink-0 text-neutral-500">
              {STAGE_LABEL[stage]}
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-5 shrink-0 text-right font-bold text-neutral-800">
              {value}
            </span>
            <span className="w-10 shrink-0 text-right text-xs text-neutral-400">
              {pct}%
            </span>
          </div>
        );
      })}
    </div>
  );
}
