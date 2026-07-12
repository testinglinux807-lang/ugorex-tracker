"use client";

import Link, { useLinkStatus } from "next/link";
import type { Periode } from "@/lib/periode";

// Titik indikator saat navigasi filter berlangsung (ganti ?periode= tidak
// men-trigger loading.tsx karena masih di segmen yang sama). Selalu
// dirender dengan ukuran tetap supaya pill tidak bergeser; baru terlihat
// setelah ~150ms supaya tidak berkedip saat navigasi cepat.
function PendingDot() {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={`inline-block h-1.5 w-1.5 rounded-full bg-current transition-opacity ${
        pending ? "animate-pulse opacity-70 delay-150 duration-200" : "opacity-0 delay-0 duration-0"
      }`}
    />
  );
}

// Pill filter periode omzet/komisi — navigasi via query ?periode= supaya
// difilter di server (tidak perlu mengirim semua transaksi ke client).
export function PeriodeFilter({
  current,
  basePath,
}: {
  current: Periode;
  basePath: string;
}) {
  const opts: { key: Periode; label: string }[] = [
    { key: "semua", label: "Semua" },
    { key: "minggu", label: "Minggu ini" },
    { key: "bulan", label: "Bulan ini" },
  ];
  return (
    <div className="flex gap-1.5">
      {opts.map((o) => (
        <Link
          key={o.key}
          href={o.key === "semua" ? basePath : `${basePath}?periode=${o.key}`}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
            current === o.key
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {o.label}
          <PendingDot />
        </Link>
      ))}
    </div>
  );
}
