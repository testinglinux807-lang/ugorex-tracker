import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StockEditor } from "@/components/StockEditor";

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

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Stok Barang</h1>
        <p className="text-sm text-neutral-500">
          Koreksi sisa stok kalau catatan beda dengan barang fisik di toko
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <StockEditor products={productsWithStock} />
      </div>

      {adjustments.length > 0 && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Riwayat Koreksi
          </p>
          <div className="space-y-1 text-xs text-neutral-500">
            {adjustments.map((a) => (
              <p key={a.id}>
                <span className="font-medium text-neutral-700">
                  {a.prospect.product.name}
                </span>
                : {a.before} → {a.after}
                {a.note ? ` — ${a.note}` : ""}{" "}
                <span className="text-neutral-400">
                  (
                  {new Date(a.createdAt).toLocaleDateString("id-ID", {
                    day: "numeric",
                    month: "short",
                  })}
                  )
                </span>
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
