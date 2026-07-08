import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PosForm } from "@/components/PosForm";
import { TransaksiList } from "@/components/TransaksiList";
import { PosSummary } from "@/components/PosSummary";
import { wibDayStart } from "@/lib/date";

export default async function PosPage() {
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
  const [products, sales, prospects] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.sale.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.prospect.findMany({ where: { storeId } }),
  ]);
  const recent = sales.slice(0, 20);

  // Sisa stok per barang = stok dikasih sales - total terjual
  const stockByProduct = new Map<string, number>();
  const priceByProduct = new Map<string, number>();
  for (const p of prospects) {
    stockByProduct.set(p.productId, p.stock);
    if (p.price != null) priceByProduct.set(p.productId, p.price);
  }
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
    code: p.code,
    // Harga owner (kalau sudah disetel) jadi prefill; jika belum, harga katalog
    price: priceByProduct.get(p.id) ?? p.price,
    remaining: Math.max(
      0,
      (stockByProduct.get(p.id) ?? 0) - (soldByProduct.get(p.id) ?? 0),
    ),
  }));

  const startOfDay = wibDayStart();
  const todaySales = sales.filter((s) => new Date(s.createdAt) >= startOfDay);
  const todayTotal = todaySales.reduce((a, s) => a + s.total, 0);
  const todayQty = todaySales.reduce((a, s) => a + s.qty, 0);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">{user.ownedStore.name}</h1>
        <p className="text-sm text-neutral-500">Catat penjualan barang</p>
      </div>

      {/* Ringkasan hari ini (bisa disembunyikan) */}
      <PosSummary revenue={todayTotal} units={todayQty} />

      {/* Desktop: form kiri, riwayat kanan. Mobile: bertumpuk */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <PosForm products={productsWithStock} />

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Transaksi Terakhir</h2>
          <p className="mb-2 text-xs text-neutral-400">
            Klik transaksi untuk lihat struk
          </p>
          <TransaksiList
            storeName={user.ownedStore.name}
            sales={recent.map((s) => ({
              id: s.id,
              productName: s.productName,
              qty: s.qty,
              price: s.price,
              discount: s.discount,
              total: s.total,
              createdAt: s.createdAt,
            }))}
          />
        </div>
      </div>
    </div>
  );
}
