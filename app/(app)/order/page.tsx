import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isTransactionPaid } from "@/lib/midtrans";
import { notifyOrder } from "@/lib/wa-notify";
import { OrderCard } from "@/components/OrderCard";
import { OrderList } from "@/components/OrderList";
import { OrderPaymentWatcher } from "@/components/OrderPaymentWatcher";
import { OrderTabs } from "@/components/OrderTabs";
import { RestockCheckout } from "@/components/RequestForm";
import { deliveryPhotoSrcMap } from "@/lib/product-image";
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
  searchParams: Promise<{ focus?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "OWNER";
  const { focus } = await searchParams;

  if (isOwner && !user.ownedStore) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Akun ini belum terhubung ke toko. Hubungi sales/admin.
      </div>
    );
  }

  // Owner: order tokonya; sales: toko yang dia pegang; admin: semua
  const orderWhere = {
    items: { some: {} },
    ...(isOwner
      ? { storeId: user.ownedStore!.id }
      : user.role === "SALES"
        ? { store: { salesId: user.id } }
        : {}),
  };
  const orderInclude = {
    store: { include: { sales: true } },
    createdBy: true,
    // Cukup nama + stok pusat — description (daftar HP kompatibel) berat
    items: {
      include: {
        product: { select: { id: true, name: true, centralStock: true } },
      },
    },
  } as const;
  // take: riwayat lama tidak perlu ditarik ulang tiap buka halaman — angka
  // ringkasan dihitung terpisah lewat aggregate di bawah.
  const rawOrders = await prisma.request.findMany({
    where: orderWhere,
    include: orderInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  // Order dari klik notifikasi bisa lebih tua dari 100 teratas — ambil
  // terpisah (orderWhere yang sama menjaga scoping per role).
  if (focus && !rawOrders.some((r) => r.id === focus)) {
    const focused = await prisma.request.findFirst({
      where: { ...orderWhere, id: focus },
      include: orderInclude,
    });
    if (focused) rawOrders.unshift(focused);
  }

  // Angka ringkasan dihitung di DB dari SEMUA order (bukan cuma 100 yang
  // ditampilkan) supaya total tetap benar.
  const [orderAgg, pending] = await Promise.all([
    prisma.request.aggregate({
      where: orderWhere,
      _count: true,
      _sum: { total: true },
    }),
    prisma.request.count({
      where: { ...orderWhere, status: { not: "COMPLETED" } },
    }),
  ]);
  const orderCount = orderAgg._count;
  const totalValue = orderAgg._sum.total ?? 0;

  // Kolom foto (base64) di-omit global — susun URL route API dari metadata
  // ringan (lihat lib/product-image.ts) lalu tempelkan ke hasil query.
  const photoSrc = await deliveryPhotoSrcMap(rawOrders.map((r) => r.id));
  const orders = rawOrders.map((r) => ({
    ...r,
    deliveryPhoto: photoSrc.get(r.id) ?? null,
  }));
  // Urutan: yang terbaru paling atas (createdAt desc dari DB) supaya order
  // baru / checkout langsung kelihatan di pucuk. Untuk mencari order yang
  // butuh aksi (mis. Dikirim yang perlu report sampai), pakai tab filter
  // status di OrderList — jadi tidak perlu menaikkan status tertentu ke atas.

  // Datang dari klik notifikasi (?focus=<id>): order yang dimaksud ditaruh
  // paling atas + di-highlight supaya langsung ketemu tanpa mengubek
  // pagination/filter.
  const focusIdx = focus ? orders.findIndex((r) => r.id === focus) : -1;
  if (focusIdx > 0) orders.unshift(orders.splice(focusIdx, 1)[0]);
  const isFocused = (id: string) => focusIdx !== -1 && id === focus;

  // Teks pencarian per order untuk kotak cari di OrderList — no resi, kode
  // penjemputan, no order, toko/owner/area, pembuat, dan nama barang.
  const searchOf = (r: (typeof orders)[number]) =>
    [
      r.id.slice(-8),
      r.resiNo,
      r.pickupCode,
      r.store.name,
      r.store.ownerName,
      r.store.area,
      r.createdBy?.name,
      ...r.items.map((i) => i.product.name),
    ]
      .filter(Boolean)
      .join(" ");

  // ===== Tampilan OWNER: checkout + riwayat order toko =====
  if (isOwner) {
    const storeId = user.ownedStore!.id;
    const [products, prospects, sold, grosirTiers] =
      await Promise.all([
        prisma.product.findMany({
          select: {
            id: true,
            name: true,
            code: true,
            price: true,
            centralStock: true,
            // Tier kompatibilitas + kode mold (teks pendek) — dipakai badge
            // & pencarian di picker restok
            description: true,
          },
          orderBy: { name: "asc" },
        }),
        prisma.prospect.findMany({ where: { storeId } }),
        prisma.sale.groupBy({
          by: ["productId"],
          where: { storeId },
          _sum: { qty: true },
        }),
        prisma.grosirTier.findMany({
          where: { active: true },
          select: { minQty: true, percent: true },
        }),
      ]);
    // Order yang masih perlu dibayar online — dipantau watcher supaya status
    // ikut update begitu owner balik dari app pembayaran (mis. GoPay). Batasi
    // ke 5 terbaru (orders sudah createdAt desc) biar tak menembak Midtrans
    // untuk order lama yang telanjur kedaluwarsa.
    const pendingPayIds = orders
      .filter(
        (r) =>
          r.paymentStatus !== "PAID" &&
          r.paymentMethod &&
          r.paymentMethod !== "CASH" &&
          r.status !== "COMPLETED",
      )
      .slice(0, 5)
      .map((r) => r.id);

    const stockBy = new Map(prospects.map((p) => [p.productId, p.stock]));
    const soldBy = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));
    // Semua barang yang stok pusatnya tersedia bisa di-order owner —
    // termasuk model yang belum pernah ada di toko ini (dulu dibatasi
    // "pernah dikasih sales dulu", dilonggarkan 16 Jul 2026: owner bebas
    // restok model apa pun selama gudang pusat punya).
    const ownerProducts = products
      .filter((p) => p.centralStock > 0 || (stockBy.get(p.id) ?? 0) > 0)
      .map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        price: p.price,
        remaining: Math.max(
          0,
          (stockBy.get(p.id) ?? 0) - (soldBy.get(p.id) ?? 0),
        ),
        central: p.centralStock,
        search: p.description,
      }));

    return (
      <div className="space-y-5">
        <OrderPaymentWatcher pendingIds={pendingPayIds} />
        <div>
          <h1 className="text-2xl font-bold">Order</h1>
          <p className="text-sm text-neutral-500">
            Order restok dari stok pusat & pantau statusnya
          </p>
        </div>

        <OrderTabs
          defaultTab={focusIdx !== -1 ? "history" : "checkout"}
          historyCount={orderCount}
          checkout={
            <RestockCheckout
              products={ownerProducts}
              grosirTiers={grosirTiers}
            />
          }
          history={
            <div className="rounded-2xl border border-neutral-200 bg-white p-5">
              <div className="mb-3 flex items-center gap-2">
                <ShoppingBag className="h-4 w-4 text-neutral-500" />
                <h2 className="font-semibold">
                  Riwayat Order ({orderCount})
                </h2>
              </div>
              <OrderList
                emptyAll="Belum ada order. Checkout lewat form Buat Order."
                items={orders.map((r) => ({
                  status: r.status,
                  search: searchOf(r),
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
  // order UNPAID terbaru yang punya charge online (VA/QRIS/GoPay/Kartu).
  const staleCandidates = orders
    .filter(
      (r) =>
        r.paymentStatus !== "PAID" &&
        r.paymentMethod &&
        r.paymentMethod !== "CASH" &&
        r.status !== "COMPLETED",
    )
    .slice(0, 5);
  const paidNow = (
    await Promise.all(
      staleCandidates.map(async (r) =>
        (await isTransactionPaid(r.txnId ?? r.id)) ? r.id : null,
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
          <p className="text-2xl font-bold">{orderCount}</p>
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
          search: searchOf(r),
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
