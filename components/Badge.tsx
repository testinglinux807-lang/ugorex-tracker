import {
  STAGE_LABEL,
  STAGE_HEX,
  STAGE_ON,
  RESULT_LABEL,
  RESULT_COLOR,
  type Stage,
  type Result,
} from "@/lib/constants";

export function StageBadge({ stage }: { stage: string }) {
  const s = stage as Stage;
  const bg = STAGE_HEX[s];
  const fg = STAGE_ON[s];
  return (
    <span
      className="inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium"
      style={
        bg
          ? { backgroundColor: bg, color: fg, borderColor: bg }
          : undefined
      }
    >
      {STAGE_LABEL[s] ?? stage}
    </span>
  );
}

export function ResultBadge({ result }: { result: string }) {
  const r = result as Result;
  return (
    <span
      className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-medium ${
        RESULT_COLOR[r] ?? "bg-white text-neutral-600 border-neutral-300"
      }`}
    >
      {RESULT_LABEL[r] ?? result}
    </span>
  );
}
