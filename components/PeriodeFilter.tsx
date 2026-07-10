import Link from "next/link";
import type { Periode } from "@/lib/periode";

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
          className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
            current === o.key
              ? "border-neutral-900 bg-neutral-900 text-white"
              : "border-neutral-300 bg-white text-neutral-600 hover:bg-neutral-100"
          }`}
        >
          {o.label}
        </Link>
      ))}
    </div>
  );
}
