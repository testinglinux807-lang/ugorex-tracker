"use client";

import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type SaleData = {
  createdAt: Date;
  qty: number;
  total: number;
  productName: string;
  product?: { code: string | null } | null; // kode mold (mis. AA01)
  store: { area: string | null };
};

const rpShort = (n: number) =>
  n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}jt`
    : n >= 1_000
      ? `${Math.round(n / 1_000)}rb`
      : `${n}`;

type TimeFilter = "all" | "weekly" | "monthly" | "yearly";

export function TopProductsInteractive({ sales }: { sales: SaleData[] }) {
  const [timeFilter, setTimeFilter] = useState<TimeFilter>("all");
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

    // Aggregate by product (bawa kode mold biar bisa tampil)
    const byProduct = new Map<
      string,
      { units: number; revenue: number; code: string | null }
    >();
    for (const s of filtered) {
      const r =
        byProduct.get(s.productName) ?? { units: 0, revenue: 0, code: null };
      r.units += s.qty;
      r.revenue += s.total;
      if (!r.code && s.product?.code) r.code = s.product.code;
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
  const handleTimeFilter = (val: TimeFilter) => {
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
          onChange={(e) => handleTimeFilter(e.target.value as TimeFilter)}
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
                <div className="mb-1 flex items-start justify-between gap-2 text-sm">
                  <span className="flex min-w-0 flex-1 items-start gap-2">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                      {actualIndex + 1}
                    </span>
                    <span className="min-w-0 break-words font-medium leading-snug">
                      {p.code && (
                        <span className="mr-1.5 rounded bg-neutral-900 px-1 py-0.5 align-middle text-[10px] font-bold text-white">
                          {p.code}
                        </span>
                      )}
                      {p.name}
                    </span>
                  </span>
                  <span className="shrink-0 whitespace-nowrap text-xs text-neutral-500">
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
