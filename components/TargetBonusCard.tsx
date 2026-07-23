import {
  Target,
  ChevronDown,
  Check,
  BadgeCheck,
  X as XIcon,
} from "lucide-react";
import { periodLabel } from "@/lib/sales-score-history";
import type { MonthlyBonusProgress, BonusHistoryRow } from "@/lib/target-bonus";
import { ClaimScratchCard } from "@/components/ClaimScratchCard";

// Kartu "Target Bulanan" di /order owner — progres order RESTOK bulan ini
// vs target admin (lib/target-bonus.ts), reset otomatis tiap tanggal 1.
// Begitu tercapai, voucher gratis-nya otomatis diterbitkan di background;
// tombol "Ambil Voucher" pindah ke tab Checkout dengan voucher itu udah
// otomatis ke-apply + produknya masuk keranjang (lihat ?claimBonus=1 di
// app/(app)/order/page.tsx + prop initialVoucher di RequestForm.tsx).
// history = bulan-bulan sebelumnya (tercapai/enggak, voucher dipakai/belum).
export function TargetBonusCard({
  progress,
  history = [],
}: {
  progress: MonthlyBonusProgress;
  history?: BonusHistoryRow[];
}) {
  const pct = Math.min(100, Math.round((progress.sold / progress.qty) * 100));
  const remaining = Math.max(0, progress.qty - progress.sold);

  return (
    <section className="overflow-hidden rounded-2xl bg-neutral-900 p-5 text-white">
      {/* Header: judul + periode (subtle, senada kartu dark lain di app) */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-sm font-semibold">
          <Target className="h-4 w-4 shrink-0 text-brand" /> Target Bulanan
        </span>
        <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-neutral-400">
          {periodLabel(progress.period)}
        </span>
      </div>

      {/* Angka progres + hadiah — di-stack (hadiah di baris bawah) biar
          nama produk panjang tetap rapi di layar HP, tidak meluber. */}
      <p className="text-3xl font-extrabold leading-none">
        {progress.sold}
        <span className="ml-1.5 text-base font-semibold text-neutral-500">
          / {progress.qty} pcs
        </span>
      </p>
      <p className="mt-2 break-words text-xs text-neutral-400">
        Hadiah:{" "}
        <span className="font-semibold text-brand">
          gratis 1 {progress.productName}
        </span>
      </p>

      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-brand transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      <p className="mt-2.5 text-xs text-neutral-400">
        {!progress.reached
          ? `Kurang ${remaining} pcs lagi buat dapet gratis ${progress.productName}. Reset otomatis tanggal 1.`
          : progress.voucherUsed
            ? "Selamat, voucher bulan ini udah berhasil kamu klaim."
            : "Target tercapai! Gores kartu di bawah buat buka kode vouchernya."}
      </p>

      {progress.reached && progress.claimVoucher && (
        <div className="mt-3">
          <ClaimScratchCard
            code={progress.claimVoucher.code}
            alreadyRevealed={progress.revealed}
          />
        </div>
      )}
      {progress.reached && progress.voucherUsed && (
        <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand/30 bg-brand/10 px-3 py-2.5 text-xs font-semibold text-brand">
          <BadgeCheck className="h-4 w-4 shrink-0" />
          Voucher {progress.voucherCode} sudah diklaim
        </div>
      )}

      {history.length > 0 && (
        <details className="ug-acc mt-4 border-t border-white/10 pt-3">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-xs font-medium text-neutral-400 [&::-webkit-details-marker]:hidden">
            <ChevronDown className="h-3.5 w-3.5 shrink-0" />
            Riwayat bulan sebelumnya
          </summary>
          <div className="mt-2 space-y-1.5">
            {history.map((h) => (
              <div
                key={h.period}
                className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-neutral-200">
                    {periodLabel(h.period)}
                  </p>
                  <p className="break-words text-neutral-500">
                    {h.sold}/{h.qty} pcs → gratis 1 {h.productName}
                  </p>
                </div>
                <span
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-1 font-semibold ${
                    h.reached
                      ? "border border-brand/30 bg-brand/10 text-brand"
                      : "bg-white/5 text-neutral-500"
                  }`}
                >
                  {h.reached ? (
                    <>
                      <Check className="h-3 w-3" />
                      {h.voucherUsed ? "Diklaim" : "Belum"}
                    </>
                  ) : (
                    <>
                      <XIcon className="h-3 w-3" />
                      Gagal
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
