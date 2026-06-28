"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type SaleData = {
  createdAt: Date;
  qty: number;
  total: number;
  productName: string;
  store: { area: string | null };
};

const rpShort = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}jt`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}rb`
      : `${n}`;

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export function TopProductsInteractive({ sales }: { sales: SaleData[] }) {
  const [timeFilter, setTimeFilter] = useState<"all" | "weekly" | "monthly" | "yearly">("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 7;

  const uniqueAreas = useMemo(() => {
    const areas = new Set<string>();
    sales.forEach((s) => {
      if (s.store?.area) areas.add(s.store.area);
    });
    return Array.from(areas).sort();
  }, [sales]);

  const filteredData = useMemo(() => {
    let filtered = sales;

    // Filter by area
    if (areaFilter !== "all") {
      filtered = filtered.filter((s) => s.store?.area === areaFilter);
    }

    // Filter by time
    const now = new Date();
    if (timeFilter === "weekly") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((s) => new Date(s.createdAt) >= oneWeekAgo);
    } else if (timeFilter === "monthly") {
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((s) => new Date(s.createdAt) >= oneMonthAgo);
    } else if (timeFilter === "yearly") {
      const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      filtered = filtered.filter((s) => new Date(s.createdAt) >= oneYearAgo);
    }

    // Aggregate by product
    const byProduct = new Map<string, { units: number; revenue: number }>();
    for (const s of filtered) {
      const r = byProduct.get(s.productName) ?? { units: 0, revenue: 0 };
      r.units += s.qty;
      r.revenue += s.total;
      byProduct.set(s.productName, r);
    }

    // Sort by units descending (semua produk, biar pagination jalan)
    return [...byProduct.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.units - a.units);
  }, [sales, timeFilter, areaFilter]);

  const totalPages = Math.ceil(filteredData.length / itemsPerPage);
  const paginatedData = filteredData.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const maxUnits = Math.max(1, ...filteredData.map((d) => d.units));

  // Reset pagination on filter change
  const handleTimeFilter = (val: "all" | "weekly" | "monthly" | "yearly") => {
    setTimeFilter(val);
    setCurrentPage(1);
  };
  const handleAreaFilter = (val: string) => {
    setAreaFilter(val);
    setCurrentPage(1);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={timeFilter}
          onChange={(e) => handleTimeFilter(e.target.value as any)}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 outline-none focus:border-brand"
        >
          <option value="all">Semua Waktu</option>
          <option value="weekly">7 Hari Terakhir</option>
          <option value="monthly">30 Hari Terakhir</option>
          <option value="yearly">1 Tahun Terakhir</option>
        </select>
        
        <select
          value={areaFilter}
          onChange={(e) => handleAreaFilter(e.target.value)}
          className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs text-neutral-700 outline-none focus:border-brand"
        >
          <option value="all">Semua Daerah</option>
          {uniqueAreas.map((area) => (
            <option key={area} value={area}>
              {area}
            </option>
          ))}
        </select>
      </div>

      {filteredData.length === 0 ? (
        <p className="text-sm text-neutral-400 flex-1">Belum ada penjualan untuk filter ini.</p>
      ) : (
        <ul className="space-y-3 flex-1 min-h-[220px]">
          {paginatedData.map((p, i) => {
            const actualIndex = (currentPage - 1) * itemsPerPage + i;
            const pct = Math.round((p.units / maxUnits) * 100);
            return (
              <li key={p.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                      {actualIndex + 1}
                    </span>
                    <span className="font-medium truncate max-w-[120px]">{p.name}</span>
                  </span>
                  <span className="text-xs text-neutral-500">
                    <span className="font-semibold text-neutral-900">
                      {p.units}
                    </span>{" "}
                    unit · {rpShort(p.revenue)}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
                  <div
                    className="h-full rounded-full bg-brand transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3">
          <span className="text-xs text-neutral-500">
            Hal {currentPage} dari {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="rounded border border-neutral-200 p-1 text-neutral-600 disabled:opacity-50 hover:bg-neutral-50"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="rounded border border-neutral-200 p-1 text-neutral-600 disabled:opacity-50 hover:bg-neutral-50"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
