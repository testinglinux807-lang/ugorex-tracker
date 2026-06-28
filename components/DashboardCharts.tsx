// Grafik dashboard (server component, SVG/CSS murni)

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

// Grafik batang penjualan per periode
export function RevenueBarChart({
  data,
}: {
  data: { label: string; value: number }[];
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex h-full min-h-[11rem] items-stretch gap-2">
      {data.map((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        return (
          <div key={i} className="flex flex-1 flex-col">
            <div className="flex flex-1 items-end">
              <div
                title={rupiah(d.value)}
                className="w-full rounded-t bg-brand"
                style={{ height: `${Math.max(pct, d.value > 0 ? 4 : 0)}%` }}
              />
            </div>
            <span className="mt-1 truncate text-center text-[10px] text-neutral-400">
              {d.label}
            </span>
            <span className="truncate text-center text-[10px] font-medium text-neutral-600">
              {d.value > 0 ? rpShort(d.value) : "-"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Produk terlaris (bar horizontal, by unit terjual)
export function TopProductsChart({
  data,
}: {
  data: { name: string; units: number; revenue: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada penjualan.</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.units));
  return (
    <ul className="space-y-3">
      {data.slice(0, 6).map((p, i) => {
        const pct = Math.round((p.units / max) * 100);
        return (
          <li key={p.name}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium">{p.name}</span>
              </span>
              <span className="text-xs text-neutral-500">
                <span className="font-semibold text-neutral-900">
                  {p.units}
                </span>{" "}
                unit · {rupiah(p.revenue)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// Leaderboard sales (bar horizontal)
export function TopSalesChart({
  data,
}: {
  data: { name: string; value: number }[];
}) {
  if (data.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada penjualan.</p>;
  }
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ul className="space-y-3">
      {data.slice(0, 6).map((s, i) => {
        const pct = Math.round((s.value / max) * 100);
        return (
          <li key={s.name}>
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-neutral-100 text-xs font-bold text-neutral-500">
                  {i + 1}
                </span>
                <span className="font-medium">{s.name}</span>
              </span>
              <span className="text-xs font-semibold">{rupiah(s.value)}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-100">
              <div
                className="h-full rounded-full bg-brand"
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
