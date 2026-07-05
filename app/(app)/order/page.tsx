import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isTransactionPaid } from "@/lib/midtrans";
import { notifyOrder } from "@/lib/wa-notify";
import { OrderCard } from "@/components/OrderCard";
import { OrderList } from "@/components/OrderList";
import { OrderTabs } from "@/components/OrderTabs";
import { RestockCheckout } from "@/components/RequestForm";
import { deliveryPhotoSrc, productImageSrc } from "@/lib/product-image";
import { ShoppingBag } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default async function OrderPage({
  searchParams,
}: {
  searchParams: Promise<{ sync?: string; focus?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "OWNER";

  // Balik dari halaman pembayaran Snap (alur redirect di HP): cocokkan
  // status order ini ke Midtrans dulu supaya badge "Lunas" langsung benar —
  // webhook belum tentu sampai (localhost / notification URL belum diset).
  const { sync, focus } = await searchParams;
  if (isOwner && user.ownedStore && typeof sync === "string") {
    const target = await prisma.request.findUnique({ where: { id: sync } });
    if (
      target &&
      target.storeId === user.ownedStore.id &&
      target.paymentStatus !== "PAID" &&
      (await isTransactionPaid(target.id))
    ) {
      const res = await prisma.request.updateMany({
        where: { id: target.id, paymentStatus: { not: "PAID" } },
        data: { paymentStatus: "PAID" },
      });
      if (res.count > 0) after(() => notifyOrder(target.id, "paid"));
    }
  }

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
    orderBy: { createdAt: "desc" },
  });
  // Ganti data URI foto dengan URL route API — tanpa ini, base64 yang sama
  // tertanam ulang di tiap order dan halaman membengkak sampai belasan MB.
  // Berlaku juga untuk foto bukti pengiriman.
  const orders = rawOrders.map((r) => ({
    ...r,
    deliveryPhoto: deliveryPhotoSrc(r),
    items: r.items.map((it) => ({
      ...it,
      product: { ...it.product, imageUrl: productImageSrc(it.product) },
    })),
  }));
  // Urutan kerja: Dikirim (barang di jalan, butuh report sampai) paling
  // atas, lalu Menunggu, Selesai paling bawah. Sort alfabetis status di DB
  // malah menaruh SHIPPED di ekor — kartu "hilang" habis ditandai dikirim.
  const STATUS_RANK: Record<string, number> = {
    SHIPPED: 0,
    PENDING: 1,
    COMPLETED: 2,
  };
  orders.sort(
    (a, b) => (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9),
  );

  // Datang dari klik notifikasi (?focus=<id>): order yang dimaksud ditaruh
  // paling atas + di-highlight supaya langsung ketemu tanpa mengubek
  // pagination/filter.
  const focusIdx = focus ? orders.findIndex((r) => r.id === focus) : -1;
  if (focusIdx > 0) orders.unshift(orders.splice(focusIdx, 1)[0]);
  const isFocused = (id: string) => focusIdx !== -1 && id === focus;

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

        <OrderTabs
          defaultTab={focusIdx !== -1 ? "history" : "checkout"}
          historyCount={orders.length}
          checkout={<RestockCheckout products={ownerProducts} />}
          history={
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-neutral-500" />
                <h2 className="font-semibold">
                  Riwayat Order ({orders.length})
                </h2>
              </div>
              <OrderList
                emptyAll="Belum ada order. Checkout lewat form Buat Order."
                items={orders.map((r) => ({
                  status: r.status,
                  node: (
                    <OrderCard
                      key={r.id}
                      order={r}
                      canRespond={false}
                      remaining={new Map()}
                      highlighted={isFocused(r.id)}
                    />
                  ),
                }))}
              />
            </div>
          }
        />
      </div>
    );
  }

  // ===== Tampilan ADMIN / SALES: proses orderan masuk =====

  // Badge "Belum bayar" bisa basi kalau webhook Midtrans tidak sampai
  // (localhost / notification URL belum diset). Cocokkan dulu beberapa
  // order UNPAID terbaru yang punya transaksi Snap langsung ke Midtrans.
  const staleCandidates = orders
    .filter(
      (r) =>
        r.paymentStatus !== "PAID" && r.snapToken && r.status !== "COMPLETED",
    )
    .slice(0, 5);
  const paidNow = (
    await Promise.all(
      staleCandidates.map(async (r) =>
        (await isTransactionPaid(r.id)) ? r.id : null,
      ),
    )
  ).filter((id): id is string => id !== null);
  for (const id of paidNow) {
    const res = await prisma.request.updateMany({
      where: { id, paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID" },
    });
    if (res.count > 0) after(() => notifyOrder(id, "paid"));
  }
  if (paidNow.length > 0) {
    for (const r of orders) {
      if (paidNow.includes(r.id)) r.paymentStatus = "PAID";
    }
  }

  const pending = orders.filter((r) => r.status !== "COMPLETED").length;
  const totalValue = orders.reduce((a, r) => a + r.total, 0);

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

      {/* Ringkasan — di HP kartu nilai (angka panjang) span penuh di bawah */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Total Order</p>
          <p className="text-2xl font-bold">{orders.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Menunggu Diproses</p>
          <p className="text-2xl font-bold">{pending}</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-neutral-200 bg-white p-4 sm:col-span-1">
          <p className="text-xs text-neutral-500">Total Nilai Order</p>
          <p className="break-words text-xl font-bold sm:text-2xl">
            {rupiah(totalValue)}
          </p>
        </div>
      </div>

      <OrderList
        items={orders.map((r) => ({
          status: r.status,
          node: (
            <OrderCard
              key={r.id}
              order={r}
              canRespond
              remaining={remaining}
              highlighted={isFocused(r.id)}
            />
          ),
        }))}
      />
    </div>
  );
}
