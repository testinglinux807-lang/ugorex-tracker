"use client";

import { useState } from "react";
import { Store, Users } from "lucide-react";
import { FunnelAnalysis, type StoreFunnel } from "@/components/FunnelAnalysis";
import { SalesEvaluation, type SalesEval } from "@/components/SalesEvaluation";

// Dua sudut pandang untuk data konter yang sama:
// - "konter": daftar & filter tiap konter (siapa yang bagus/jelek)
// - "sales":  agregasi per sales buat evaluasi admin
export function FunnelViews({
  stores,
  salesRows,
}: {
  stores: StoreFunnel[];
  salesRows: SalesEval[];
}) {
  const [mode, setMode] = useState<"konter" | "sales">("konter");

  const tab = (key: "konter" | "sales", label: string, Icon: typeof Store) => {
    const on = mode === key;
    return (
      <button
        type="button"
        onClick={() => setMode(key)}
        className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
          on
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100"
        }`}
      >
        <Icon className="h-4 w-4" />
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div className="inline-flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1">
        {tab("konter", "Per Konter", Store)}
        {tab("sales", "Per Sales", Users)}
      </div>

      {mode === "konter" ? (
        <FunnelAnalysis stores={stores} />
      ) : (
        <SalesEvaluation sales={salesRows} />
      )}
    </div>
  );
}
