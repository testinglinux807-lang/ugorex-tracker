import {
  ShoppingBag,
  Package,
  PackageCheck,
  PackageX,
  Truck,
  Banknote,
  XCircle,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { fmtDateTime } from "@/lib/date";

export type TimelineEvent = {
  icon: LucideIcon;
  title: string;
  sub?: string | null;
  at: Date | null;
  tone?: "default" | "danger";
};

// Timeline lacak paket: baris terbaru di ATAS & disorot (lime), garis
// penghubung menurun ke riwayat lama. Tiap baris punya ikon, judul,
// keterangan, dan waktu (tanggal + jam WIB).
export function OrderTimeline({ events }: { events: TimelineEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada riwayat status.</p>;
  }
  return (
    <ol className="relative">
      {events.map((e, i) => {
        const Icon = e.icon;
        const active = i === 0; // paling atas = status terkini
        const last = i === events.length - 1;
        const danger = e.tone === "danger";
        return (
          <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
            {/* Garis penghubung antar titik */}
            {!last && (
              <span
                aria-hidden
                className="absolute bottom-0 left-[15px] top-8 w-px bg-neutral-200"
              />
            )}
            {/* Titik ikon. TANPA z-index: header app sticky z-10 bikin
                stacking-context (drawer menu di dalamnya) — kalau ikon ini
                z-10 juga, dia nembus nutupin drawer di mobile. */}
            <span
              className={`relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                danger
                  ? "border-red-200 bg-red-50 text-red-600"
                  : active
                    ? "border-brand-dark bg-brand text-neutral-900"
                    : "border-neutral-200 bg-white text-neutral-400"
              }`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1 pt-1">
              <p
                className={`text-sm leading-snug ${
                  danger
                    ? "font-semibold text-red-700"
                    : active
                      ? "font-semibold text-neutral-900"
                      : "font-medium text-neutral-700"
                }`}
              >
                {e.title}
              </p>
              {e.sub && (
                <p className="mt-0.5 break-words text-xs text-neutral-500">
                  {e.sub}
                </p>
              )}
              <p className="mt-0.5 text-[11px] text-neutral-400">
                {e.at ? fmtDateTime(e.at) : "—"}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// Ikon dipakai page saat menyusun events (satu sumber)
export const TIMELINE_ICONS = {
  ShoppingBag,
  Package,
  PackageCheck,
  PackageX,
  Truck,
  Banknote,
  XCircle,
  BadgeCheck,
};
