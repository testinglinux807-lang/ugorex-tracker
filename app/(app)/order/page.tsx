import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { isTransactionPaid } from "@/lib/midtrans";
import { notifyOrder } from "@/lib/wa-notify";
import { printAllOrderResi, sweepExpiredOrders } from "@/app/actions/requests";
import { OrderCard } from "@/components/OrderCard";
import { OrderList } from "@/components/OrderList";
import { SubmitButton } from "@/components/SubmitButton";
import { OrderPaymentWatcher } from "@/components/OrderPaymentWatcher";
import { OrderTabs } from "@/components/OrderTabs";
import { RestockCheckout } from "@/components/RequestForm";
import { deliveryPhotoSrcMap } from "@/lib/product-image";
import {
  loadGudangLocs,
  getGudangRadiusKm,
  assignForOrder,
} from "@/lib/gudang-assign";
import { Printer, ShoppingBag } from "lucide-react";

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
  // Gudang punya halaman sendiri (/gudang) — cegah masuk ke /order.
  if (user.role === "GUDANG") redirect("/gudang");

  const isOwner = user.role === "OWNER";
  const { focus } = await searchParams;

  // Order online yang tagihannya kedaluwarsa >24 jam dibatalkan otomatis
  // (stok reservasi balik) — disapu tiap halaman order dibuka.
  await sweepExpiredOrders();

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
        product: {
          select: { id: true, name: true, code: true, centralStock: true },
        },
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
      where: {
        ...orderWhere,
        status: { notIn: ["COMPLETED", "CANCELLED", "RETURNED"] },
      },
    }),
  ]);
  const orderCount = orderAgg._count;
  const totalValue = orderAgg._sum.total ?? 0;

  // "Order ke-N dari toko ini" di footer kartu: nomor urut order per toko
  // (urut waktu dibuat, termasuk yang batal biar nomornya stabil). Query
  // ringan id+storeId saja untuk semua order restok.
  const seqRows = await prisma.request.findMany({
    where: { items: { some: {} } },
    select: { id: true, storeId: true },
    orderBy: { createdAt: "asc" },
  });
  const orderSeq = new Map<string, number>();
  {
    const perStore = new Map<string, number>();
    for (const s of seqRows) {
      const n = (perStore.get(s.storeId) ?? 0) + 1;
      perStore.set(s.storeId, n);
      orderSeq.set(s.id, n);
    }
  }

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
    const [products, prospects, grosirTiers] = await Promise.all([
      prisma.product.findMany({
        select: {
          id: true,
          name: true,
          code: true,
          price: true,
          centralStock: true,
        },
        orderBy: { name: "asc" },
      }),
      prisma.prospect.findMany({ where: { storeId } }),
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
          r.status !== "COMPLETED" &&
          r.status !== "CANCELLED" &&
          r.status !== "RETURNED",
      )
      .slice(0, 5)
      .map((r) => r.id);

    const stockBy = new Map(prospects.map((p) => [p.productId, p.stock]));
    // Owner belanja per KODE mold, bukan per model HP: barang sekode = satu
    // barang fisik (berbagi stok pusat & harga). Tiap kode dikelompokkan
    // sekali, model HP-nya jadi catatan "cocok". Nama = "Antigores Clear
    // IPHONE 16 PRO" → type "Antigores Clear" + model "IPHONE 16 PRO".
    const splitName = (name: string) => {
      const m = name.match(/^\s*(Antigores\s+\S+)\s+(.+)$/i);
      return m
        ? { type: m[1].trim(), model: m[2].trim() }
        : { type: "", model: name.trim() };
    };
    type CodeGroup = {
      code: string;
      repId: string;
      type: string;
      models: string[];
      price: number;
      central: number;
      storeStock: number;
      bestStock: number; // stok toko terbanyak → jadi produk perwakilan
    };
    const codeMap = new Map<string, CodeGroup>();
    for (const p of products) {
      // Barang tanpa kode: tetap bisa di-order sebagai grup sendiri
      const key = p.code ?? `__${p.id}`;
      const { type, model } = splitName(p.name);
      const raw = stockBy.get(p.id) ?? 0;
      const g =
        codeMap.get(key) ??
        ({
          code: p.code ?? "-",
          repId: p.id,
          type: type || p.name,
          models: [],
          price: p.price,
          central: p.centralStock,
          storeStock: 0,
          bestStock: -1,
        } satisfies CodeGroup);
      g.models.push(model);
      g.price = Math.max(g.price, p.price);
      g.central = Math.max(g.central, p.centralStock); // dibagi sekode (mirror)
      g.storeStock += raw;
      // Perwakilan = produk yang stok tokonya paling banyak, supaya restok
      // masuk ke bucket stok toko yang sudah dipakai owner (bukan bikin baru).
      if (raw > g.bestStock) {
        g.bestStock = raw;
        g.repId = p.id;
      }
      codeMap.set(key, g);
    }
    // Owner bebas restok kode apa pun selama stok pusatnya ada (atau sudah
    // punya stok di toko). Urut per kode biar stabil.
    const restockCodes = [...codeMap.values()]
      .filter((g) => g.central > 0 || g.storeStock > 0)
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((g) => ({
        code: g.code,
        repId: g.repId,
        type: g.type,
        models: g.models,
        price: g.price,
        central: g.central,
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
            <RestockCheckout codes={restockCodes} grosirTiers={grosirTiers} />
          }
          history={
            // Tanpa panel pembungkus — kartu order langsung di halaman
            // (hindari kotak-dalam-kotak yang bikin kartu makin sempit)
            <div className="space-y-3">
              <div className="flex items-center gap-2">
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
                      orderSeq={orderSeq.get(r.id)}
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
        r.status !== "COMPLETED" &&
        r.status !== "CANCELLED" &&
        r.status !== "RETURNED",
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

  // Penugasan gudang terdekat (dari sales pemegang toko) untuk order PENDING
  const [gudangLocs, gudangRadius] = await Promise.all([
    loadGudangLocs(),
    getGudangRadiusKm(),
  ]);

  // Gudang: halaman fokus ke antrian PACKING miliknya saja (paket PENDING
  // yang ditugaskan ke dirinya) — tanpa filter status & total nilai order.
  const isGudang = user.role === "GUDANG";
  const withAssign = orders.map((r) => ({
    r,
    a: assignForOrder(r, gudangLocs, gudangRadius),
  }));
  const visible = isGudang
    ? withAssign.filter(
        (x) => x.r.status === "PENDING" && x.a != null && x.a.gudangId === user.id,
      )
    : withAssign;

  // Orderan membeludak: admin cetak semua resi order yang belum dikirim
  // (Disiapkan Gudang + Siap Dipickup) sekali jalan → /order/resi-massal
  const printableCount =
    user.role === "ADMIN"
      ? await prisma.request.count({
          where: { items: { some: {} }, status: { in: ["PENDING", "READY"] } },
        })
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {isGudang ? "Paket untuk Disiapkan" : "Order"}
          </h1>
          <p className="text-sm text-neutral-500">
            {isGudang
              ? "Paket yang ditugaskan ke kamu - siapkan & cetak resinya"
              : user.role === "SALES"
                ? "Orderan restok dari toko yang kamu pegang"
                : "Orderan restok dari semua toko"}
          </p>
        </div>
        {printableCount > 0 && (
          <form
            action={async () => {
              "use server";
              await printAllOrderResi();
            }}
          >
            <SubmitButton
              pendingText="Menyiapkan…"
              overlayText="Menyiapkan semua resi…"
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              <Printer className="h-4 w-4" />
              Cetak Semua Resi ({printableCount})
            </SubmitButton>
          </form>
        )}
      </div>

      {/* Ringkasan — gudang cukup lihat jumlah paket yang harus disiapkan;
          admin/sales lihat total order, antre, & nilai. Harga disembunyikan
          dari gudang (urusan sales yang tanggung jawab ke owner toko). */}
      {isGudang ? (
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Paket untuk disiapkan</p>
          <p className="text-2xl font-bold">{visible.length}</p>
        </div>
      ) : (
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
      )}

      <OrderList
        showFilters={!isGudang}
        emptyAll={
          isGudang
            ? "Belum ada paket yang ditugaskan ke kamu."
            : "Belum ada orderan restok dari toko."
        }
        items={visible.map(({ r, a }) => ({
          status: r.status,
          search: searchOf(r),
          node: (
            <OrderCard
              key={r.id}
              order={r}
              canRespond
              isAdmin={user.role === "ADMIN"}
              isGudang={isGudang}
              canTrack={!isGudang}
              showPrice={!isGudang}
              assignedGudangName={a?.gudangName ?? null}
              assignedToMe={a != null && a.gudangId === user.id}
              assignedFar={a?.far ?? false}
              assignedDistKm={a?.salesDistKm ?? null}
              remaining={remaining}
              highlighted={isFocused(r.id)}
              orderSeq={orderSeq.get(r.id)}
            />
          ),
        }))}
      />
    </div>
  );
}
