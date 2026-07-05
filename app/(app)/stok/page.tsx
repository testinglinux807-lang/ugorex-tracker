import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StockEditor } from "@/components/StockEditor";
import { ArrowRight, History, ShoppingBag } from "lucide-react";

export default async function StokPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/");

  if (!user.ownedStore) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Akun ini belum terhubung ke toko. Hubungi sales/admin.
      </div>
    );
  }

  const storeId = user.ownedStore.id;
  const [products, sales, prospects, adjustments] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.sale.findMany({ where: { storeId } }),
    prisma.prospect.findMany({ where: { storeId } }),
    prisma.stockAdjustment.findMany({
      where: { prospect: { storeId } },
      include: { prospect: { include: { product: true } } },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  // Sisa stok per barang = stok dikasih sales - total terjual
  const stockByProduct = new Map<string, number>();
  for (const p of prospects) stockByProduct.set(p.productId, p.stock);
  const soldByProduct = new Map<string, number>();
  for (const s of sales) {
    if (s.productId)
      soldByProduct.set(
        s.productId,
        (soldByProduct.get(s.productId) ?? 0) + s.qty,
      );
  }
  const productsWithStock = products.map((p) => ({
    id: p.id,
    name: p.name,
    remaining: Math.max(
      0,
      (stockByProduct.get(p.id) ?? 0) - (soldByProduct.get(p.id) ?? 0),
    ),
  }));

  const stocked = productsWithStock.filter((p) => p.remaining > 0);
  const totalUnits = stocked.reduce((a, p) => a + p.remaining, 0);
  const low = stocked.filter((p) => p.remaining <= 5).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Stok Barang</h1>
        <p className="text-sm text-neutral-500">
          Sisa stok barang di tokomu — koreksi kalau beda dengan fisik
        </p>
      </div>

      {/* Ringkasan cepat */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Jenis Barang</p>
          <p className="text-2xl font-bold">{stocked.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Total Unit</p>
          <p className="text-2xl font-bold">{totalUnits}</p>
        </div>
        <Link
          href="/order"
          className="col-span-2 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-400 sm:col-span-1"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <ShoppingBag className="h-3.5 w-3.5" />
              Stok Menipis
            </span>
            <span className="block text-sm font-semibold">
              {low > 0 ? `${low} barang — order restok` : "Aman — order restok"}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <StockEditor products={productsWithStock} />
      </div>

      {adjustments.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            <History className="h-3.5 w-3.5" />
            Riwayat Koreksi
          </p>
          <ul className="divide-y divide-neutral-100">
            {adjustments.map((a) => {
              const delta = a.after - a.before;
              return (
                <li
                  key={a.id}
                  className="flex items-center justify-between gap-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-800">
                      {a.prospect.product.name}
                    </p>
                    {a.note && (
                      <p className="truncate text-neutral-400">{a.note}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-neutral-500">
                      {a.before} → {a.after}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 font-semibold ${
                        delta >= 0
                          ? "bg-brand/30 text-neutral-900"
                          : "bg-neutral-100 text-neutral-600"
                      }`}
                    >
                      {delta >= 0 ? `+${delta}` : delta}
                    </span>
                    <span className="text-neutral-400">
                      {new Date(a.createdAt).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
