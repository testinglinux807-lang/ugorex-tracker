import {
  STAGE_LABEL,
  STAGE_HEX,
  STAGE_ON,
  RESULT_LABEL,
  RESULT_COLOR,
  type Stage,
  type Result,
} from "@/lib/constants";
import {
  Sprout,
  Award,
  Medal,
  Trophy,
  Crown,
  type LucideIcon,
} from "lucide-react";
import { GRADE_HEX, GRADE_ON, type Grade } from "@/lib/sales-grade";

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

// Grade huruf leveling sales (S+ … E) — lib/sales-grade.ts
export function GradeBadge({
  grade,
  size = "sm",
}: {
  grade: Grade;
  size?: "sm" | "lg";
}) {
  return (
    <span
      className={`inline-block rounded-full border text-center font-bold ${
        size === "lg" ? "min-w-11 px-3 py-1 text-base" : "min-w-8 px-2 py-0.5 text-xs"
      }`}
      style={{
        backgroundColor: GRADE_HEX[grade],
        color: GRADE_ON[grade],
        borderColor: GRADE_HEX[grade],
      }}
    >
      {grade}
    </span>
  );
}

// Ikon per level sales (lib/sales-grade.ts salesLevel) — ukuran tetap,
// jenisnya yang naik kelas: tunas → medali → medali kalung → trofi → mahkota.
export const LEVEL_ICON: Record<number, LucideIcon> = {
  1: Sprout,
  2: Award,
  3: Medal,
  4: Trophy,
  5: Crown,
};

// Warna chip per level — makin tinggi makin gelap (senada GRADE_HEX);
// level 4 teks lime di atas hitam, level 5 (Sales Captain) lime brand penuh.
const LEVEL_CLS: Record<number, string> = {
  1: "border-neutral-300 bg-white text-neutral-500",
  2: "border-neutral-300 bg-neutral-100 text-neutral-700",
  3: "border-neutral-600 bg-neutral-600 text-white",
  4: "border-neutral-900 bg-neutral-900 text-brand",
  5: "border-brand bg-brand text-neutral-900",
};

// Chip "Lv. N Nama" — aman di latar terang maupun gelap.
export function LevelBadge({ level, name }: { level: number; name: string }) {
  const Icon = LEVEL_ICON[level] ?? Sprout;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        LEVEL_CLS[level] ?? LEVEL_CLS[1]
      }`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      Lv. {level} · {name}
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
