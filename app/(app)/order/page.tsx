import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { OrderCard } from "@/components/OrderCard";
import { RestockCheckout } from "@/components/RequestForm";
import { productImageSrc } from "@/lib/product-image";
import { ShoppingBag } from "lucide-react";

export default async function OrderPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "OWNER";

  if (isOwner && !user.ownedStore) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Akun ini belum terhubung ke toko. Hubungi sales/admin.
      </div>
    );
  }

  // Owner: order tokonya; sales: toko yang dia pegang; admin: semua
  const rawOrders = await prisma.request.findMany({
    where: {
      items: { some: {} },
      ...(isOwner
        ? { storeId: user.ownedStore!.id }
        : user.role === "SALES"
          ? { store: { salesId: user.id } }
          : {}),
    },
    include: {
      store: { include: { sales: true } },
      createdBy: true,
      items: { include: { product: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  // Ganti data URI foto dengan URL route API — tanpa ini, base64 yang sama
  // tertanam ulang di tiap order dan halaman membengkak sampai belasan MB.
  const orders = rawOrders.map((r) => ({
    ...r,
    items: r.items.map((it) => ({
      ...it,
      product: { ...it.product, imageUrl: productImageSrc(it.product) },
    })),
  }));

  // ===== Tampilan OWNER: checkout + riwayat order toko =====
  if (isOwner) {
    const storeId = user.ownedStore!.id;
    const [products, prospects, sold] = await Promise.all([
      prisma.product.findMany({ orderBy: { name: "asc" } }),
      prisma.prospect.findMany({ where: { storeId } }),
      prisma.sale.groupBy({
        by: ["productId"],
        where: { storeId },
        _sum: { qty: true },
      }),
    ]);
    const stockBy = new Map(prospects.map((p) => [p.productId, p.stock]));
    const soldBy = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));
    const ownerProducts = products.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      remaining: Math.max(0, (stockBy.get(p.id) ?? 0) - (soldBy.get(p.id) ?? 0)),
      central: p.centralStock,
      imageUrl: productImageSrc(p),
    }));

    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold">Order</h1>
          <p className="text-sm text-neutral-500">
            Order restok dari stok pusat & pantau statusnya
          </p>
        </div>

        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <RestockCheckout products={ownerProducts} />

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <ShoppingBag className="h-4 w-4 text-neutral-500" />
              <h2 className="font-semibold">Riwayat Order ({orders.length})</h2>
            </div>
            {orders.length === 0 ? (
              <p className="text-sm text-neutral-400">
                Belum ada order. Checkout lewat form di samping.
              </p>
            ) : (
              <ul className="space-y-3">
                {orders.map((r) => (
                  <OrderCard
                    key={r.id}
                    order={r}
                    canRespond={false}
                    remaining={new Map()}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ===== Tampilan ADMIN / SALES: proses orderan masuk =====
  const pending = orders.filter((r) => r.status !== "COMPLETED").length;
  const unpaid = orders.filter(
    (r) => r.paymentStatus !== "PAID" && r.status !== "COMPLETED",
  ).length;

  // Sisa stok per (toko, barang) — biar langsung kelihatan kondisi stok toko
  const storeIds = [...new Set(orders.map((r) => r.storeId))];
  const [prospects, sold] = await Promise.all([
    prisma.prospect.findMany({ where: { storeId: { in: storeIds } } }),
    prisma.sale.groupBy({
      by: ["storeId", "productId"],
      where: { storeId: { in: storeIds } },
      _sum: { qty: true },
    }),
  ]);
  const remaining = new Map<string, number>();
  for (const p of prospects) remaining.set(`${p.storeId}:${p.productId}`, p.stock);
  for (const s of sold) {
    if (!s.productId) continue;
    const key = `${s.storeId}:${s.productId}`;
    remaining.set(
      key,
      Math.max(0, (remaining.get(key) ?? 0) - (s._sum.qty ?? 0)),
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Order</h1>
        <p className="text-sm text-neutral-500">
          {user.role === "SALES"
            ? "Orderan restok dari toko yang kamu pegang"
            : "Orderan restok dari semua toko"}
        </p>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Total Order</p>
          <p className="text-2xl font-bold">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Menunggu Diproses</p>
          <p className="text-2xl font-bold text-amber-600">{pending}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Belum Dibayar</p>
          <p className="text-2xl font-bold">{unpaid}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Belum ada orderan restok dari toko.
        </div>
      ) : (
        <ul className="space-y-3">
          {orders.map((r) => (
            <OrderCard key={r.id} order={r} canRespond remaining={remaining} />
          ))}
        </ul>
      )}
    </div>
  );
}
