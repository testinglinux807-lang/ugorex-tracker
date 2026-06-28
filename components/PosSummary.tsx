"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export function PosSummary({
  revenue,
  units,
}: {
  revenue: number;
  units: number;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (localStorage.getItem("ug_hide_amount") === "1") setHidden(true);
  }, []);

  function toggle() {
    setHidden((h) => {
      const n = !h;
      localStorage.setItem("ug_hide_amount", n ? "1" : "0");
      return n;
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-neutral-500">Penjualan hari ini</p>
          <button
            type="button"
            onClick={toggle}
            aria-label={hidden ? "Tampilkan angka" : "Sembunyikan angka"}
            className="text-neutral-400 hover:text-neutral-900"
          >
            {hidden ? (
              <EyeOff className="h-4 w-4" />
            ) : (
              <Eye className="h-4 w-4" />
            )}
          </button>
        </div>
        <p className="truncate text-2xl font-bold">
          {hidden ? "Rp ••••••" : rupiah(revenue)}
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-4">
        <p className="text-xs text-neutral-500">Unit terjual hari ini</p>
        <p className="truncate text-2xl font-bold">
          {hidden ? "••••" : units}
        </p>
      </div>
    </div>
  );
}
