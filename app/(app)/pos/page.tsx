import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PosForm } from "@/components/PosForm";
import { TransaksiList } from "@/components/TransaksiList";
import { PosSummary } from "@/components/PosSummary";
import { RateSalesForm } from "@/components/RateSalesForm";
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
  const startOfDay = wibDayStart();
  // Hitung agregat (terjual per barang, total hari ini) di database — jangan
  // menarik seluruh riwayat transaksi tiap render; tabel Sale terus tumbuh.
  const [products, recent, sold, todayAgg, prospects, mySales, myRating] =
    await Promise.all([
      prisma.product.findMany({
        // description (daftar HP kompatibel) berat & tak dipakai di POS
        select: { id: true, name: true, code: true, price: true },
        orderBy: { name: "asc" },
      }),
      prisma.sale.findMany({
        where: { storeId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.sale.groupBy({
        by: ["productId"],
        where: { storeId },
        _sum: { qty: true },
      }),
      prisma.sale.aggregate({
        where: { storeId, createdAt: { gte: startOfDay } },
        _sum: { total: true, qty: true },
      }),
      prisma.prospect.findMany({ where: { storeId } }),
      // Sales pemegang konter + rating yang pernah diberikan owner ini —
      // untuk form "Nilai Sales Kamu" di bawah
      user.ownedStore.salesId
        ? prisma.user.findUnique({
            where: { id: user.ownedStore.salesId },
            select: { name: true },
          })
        : null,
      prisma.salesRating.findUnique({ where: { storeId } }),
    ]);

  // Sisa stok per barang = stok dikasih sales - total terjual
  const stockByProduct = new Map<string, number>();
  const priceByProduct = new Map<string, number>();
  for (const p of prospects) {
    stockByProduct.set(p.productId, p.stock);
    if (p.price != null) priceByProduct.set(p.productId, p.price);
  }
  const soldByProduct = new Map<string, number>();
  for (const s of sold) {
    if (s.productId) soldByProduct.set(s.productId, s._sum.qty ?? 0);
  }
  const productsWithStock = products
    // Hanya barang yang pernah dikasih stok ke toko ini — katalog pusat
    // yang belum pernah dimiliki owner tidak ikut tampil di POS.
    .filter((p) => (stockByProduct.get(p.id) ?? 0) > 0)
    .map((p) => ({
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

  const todayTotal = todayAgg._sum.total ?? 0;
  const todayQty = todayAgg._sum.qty ?? 0;

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

      {/* Rating sales pemegang konter — tampil di Performa Sales (admin) */}
      {mySales && (
        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="font-semibold">Nilai Sales Kamu</h2>
          <p className="mb-3 text-xs text-neutral-400">
            Gimana pelayanan {mySales.name} selama ini? Rating & keteranganmu
            membantu kami menjaga kualitas layanan - bisa diubah kapan saja.
          </p>
          <div className="max-w-md">
            <RateSalesForm
              salesName={mySales.name}
              currentStars={myRating?.stars ?? null}
              currentNote={myRating?.note ?? null}
            />
          </div>
        </div>
      )}
    </div>
  );
}
