"use client";

import { useState } from "react";
import { RevenueBarChart } from "@/components/DashboardCharts";

export type SalePoint = { ts: number; total: number };
type Range = "7d" | "8w" | "6m";

const RANGES: { key: Range; label: string }[] = [
  { key: "7d", label: "7 Hari" },
  { key: "8w", label: "8 Minggu" },
  { key: "6m", label: "6 Bulan" },
];

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function buildBuckets(sales: SalePoint[], range: Range) {
  const buckets: { start: number; end: number; label: string; value: number }[] =
    [];
  const now = new Date();

  if (range === "7d") {
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      buckets.push({
        start: d.getTime(),
        end: d.getTime() + 86400000,
        label: d.toLocaleDateString("id-ID", { weekday: "short" }),
        value: 0,
      });
    }
  } else if (range === "8w") {
    for (let i = 7; i >= 0; i--) {
      const end = new Date();
      end.setHours(0, 0, 0, 0);
      end.setDate(end.getDate() - i * 7);
      const start = new Date(end);
      start.setDate(start.getDate() - 6);
      buckets.push({
        start: start.getTime(),
        end: end.getTime() + 86400000,
        label: start.toLocaleDateString("id-ID", {
          day: "numeric",
          month: "short",
        }),
        value: 0,
      });
    }
  } else {
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      buckets.push({
        start: d.getTime(),
        end: end.getTime(),
        label: d.toLocaleDateString("id-ID", { month: "short" }),
        value: 0,
      });
    }
  }

  for (const s of sales) {
    const b = buckets.find((x) => s.ts >= x.start && s.ts < x.end);
    if (b) b.value += s.total;
  }
  return buckets;
}

export function SalesTrendChart({ sales }: { sales: SalePoint[] }) {
  const [range, setRange] = useState<Range>("7d");
  const data = buildBuckets(sales, range);
  const total = data.reduce((a, d) => a + d.value, 0);

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xl font-bold">{rupiah(total)}</p>
        <div className="flex gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                range === r.key
                  ? "border-neutral-900 bg-neutral-900 text-white"
                  : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1">
        <RevenueBarChart data={data} />
      </div>
    </div>
  );
}
