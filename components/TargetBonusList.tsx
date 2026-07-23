import { ChevronDown, Target } from "lucide-react";
import type { MonthlyBonusProgress } from "@/lib/target-bonus";

// Progres "Target Bulanan" SEMUA konter yang dipegang sales (di /order) —
// beda dari kartu di /pos (1 toko doang, punya owner): ini daftar ringkas
// biar sales tahu konter mana yang tinggal sedikit lagi, buat didorong.
// Dilipat (details) supaya tidak mendorong daftar orderan jauh ke bawah;
// ringkasannya tetap kebaca dari baris summary tanpa perlu dibuka.
export function TargetBonusList({
  items,
}: {
  items: {
    storeId: string;
    storeName: string;
    progress: MonthlyBonusProgress;
  }[];
}) {
  if (items.length === 0) return null;

  // Yang belum tercapai & paling dekat duluan (paling actionable buat
  // didorong); yang udah tercapai ditaruh di bawah.
  const sorted = [...items].sort((a, b) => {
    if (a.progress.reached !== b.progress.reached) {
      return a.progress.reached ? 1 : -1;
    }
    const remA = a.progress.qty - a.progress.sold;
    const remB = b.progress.qty - b.progress.sold;
    return remA - remB;
  });
  const { qty, productName } = items[0].progress;
  const reachedCount = items.filter((i) => i.progress.reached).length;
  // Konter yang tinggal ≤ 20% lagi — alasan utama daftar ini dibuka
  const nearly = sorted.filter(
    (i) => !i.progress.reached && i.progress.sold >= i.progress.qty * 0.8,
  ).length;

  return (
    <details className="ug-acc group overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <Target className="h-4 w-4 shrink-0 text-neutral-500" />
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">Target Bulanan Konter</h2>
          <p className="text-xs text-neutral-400">
            {reachedCount} dari {items.length} konter tercapai
            {nearly > 0 ? ` · ${nearly} tinggal dikit lagi` : ""}
          </p>
        </div>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
      </summary>

      <div className="border-t border-neutral-100 p-5">
        <p className="mb-3 text-xs text-neutral-400">
          Progres order restok tiap konter vs target admin ({qty} pcs/bulan →
          gratis 1 {productName}) - dorong yang tinggal dikit lagi.
        </p>
        <div className="space-y-2">
          {sorted.map(({ storeId, storeName, progress }) => {
            const pct = Math.min(
              100,
              Math.round((progress.sold / progress.qty) * 100),
            );
            const remaining = Math.max(0, progress.qty - progress.sold);
            return (
              <div
                key={storeId}
                className="rounded-xl border border-neutral-200 p-3"
              >
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium">
                    {storeName}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-neutral-500">
                    {progress.sold}/{progress.qty} pcs
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className={`h-full rounded-full ${
                      progress.reached ? "bg-brand-dark" : "bg-neutral-900"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-neutral-400">
                  {progress.reached
                    ? `Tercapai - voucher ${progress.voucherCode} udah masuk ke toko ini`
                    : `Kurang ${remaining} pcs lagi`}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </details>
  );
}
