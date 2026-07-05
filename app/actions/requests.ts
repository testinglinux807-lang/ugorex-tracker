"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyOrder } from "@/lib/wa-notify";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  createSnapTransaction,
  isTransactionPaid,
  snapRedirectUrl,
} from "@/lib/midtrans";
import { findUsableVoucher, consumeVoucher } from "@/lib/voucher";
import { voucherDiscount } from "@/lib/voucher-calc";

// Owner mengajukan request restok: pilih barang + jumlah langsung (checkout)
export async function createRestockRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa mengajukan request." };
  }

  // Kumpulkan item yang di-checkout (key: qty__<productId>)
  const items: { productId: string; qty: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("qty__")) continue;
    const qty = parseInt(String(val), 10) || 0;
    if (qty > 0) items.push({ productId: key.slice(5), qty });
  }
  if (items.length === 0) {
    return { error: "Pilih minimal satu barang dan isi jumlahnya." };
  }

  const products = await prisma.product.findMany({
    where: { id: { in: items.map((i) => i.productId) } },
  });
  if (products.length !== items.length) {
    return { error: "Ada barang yang tidak valid." };
  }

  // Jumlah order tidak boleh melebihi stok pusat saat ini
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId)!;
    if (item.qty > product.centralStock) {
      return {
        error: `Stok pusat ${product.name} tinggal ${product.centralStock}, kurangi jumlahnya.`,
      };
    }
  }

  const note = String(formData.get("note") ?? "").trim();
  const productOf = new Map(products.map((p) => [p.id, p]));
  const summary = items
    .map((i) => `${productOf.get(i.productId)!.name} ×${i.qty}`)
    .join(", ");

  // Snapshot harga saat checkout + total belanja (gross_amount untuk Midtrans)
  const itemRows = items.map((i) => ({
    productId: i.productId,
    qty: i.qty,
    price: productOf.get(i.productId)!.price,
  }));
  const subtotal = itemRows.reduce((a, i) => a + i.qty * i.price, 0);

  // Voucher (opsional) — validasi ulang & konsumsi kuota di server,
  // preview di client tidak dipercaya.
  const voucherCodeRaw = String(formData.get("voucherCode") ?? "").trim();
  let discount = 0;
  let voucherCode: string | null = null;
  if (voucherCodeRaw) {
    const found = await findUsableVoucher(voucherCodeRaw);
    if ("error" in found) return { error: found.error };
    discount = voucherDiscount(found.voucher!, subtotal);
    if (!(await consumeVoucher(found.voucher!))) {
      return { error: "Kuota voucher sudah habis." };
    }
    voucherCode = found.voucher!.code;
  }
  const total = subtotal - discount;

  // ID order dibuat di muka supaya transaksi Snap + insert DB cukup dua
  // network call berurutan (Midtrans lalu Neon) — tanpa update terpisah
  // untuk menyimpan token. Latensi checkout didominasi dua call ini.
  const orderId = randomUUID();

  // Buat transaksi Midtrans Snap (null kalau kunci belum dikonfigurasi;
  // dilewati juga saat total 0 karena diskon penuh — Midtrans menolak
  // gross_amount 0). Diskon dikirim sebagai item bernilai minus supaya
  // jumlah item = gross_amount. Token disimpan supaya order yang popup-nya
  // keburu ditutup masih bisa dibayar lewat tombol "Bayar" di riwayat.
  const snap =
    total > 0
      ? await createSnapTransaction({
          orderId,
          grossAmount: total,
          customerName: user.name,
          items: [
            ...itemRows.map((i) => ({
              id: i.productId,
              price: i.price,
              quantity: i.qty,
              name: productOf.get(i.productId)!.name,
            })),
            ...(discount > 0
              ? [
                  {
                    id: "VOUCHER",
                    price: -discount,
                    quantity: 1,
                    name: `Diskon voucher ${voucherCode}`,
                  },
                ]
              : []),
          ],
          finishUrl: orderFinishUrl(orderId),
        })
      : null;

  // Diskon penuh (total 0) = tidak ada yang perlu dibayar → langsung lunas
  const freeOrder = total === 0;

  await prisma.request.create({
    data: {
      id: orderId,
      storeId: user.ownedStore.id,
      subject: `Restok ${items.length} barang`,
      message: note || summary,
      createdById: user.id,
      total,
      discount,
      voucherCode,
      paymentStatus: freeOrder ? "PAID" : "UNPAID",
      snapToken: snap?.token ?? null,
      items: { create: itemRows },
    },
  });

  // Kalau Midtrans aktif, notifikasi dikirim saat pembayaran LUNAS
  // (webhook / syncOrderPayment). Tanpa Midtrans / order gratis penuh,
  // kabari sekarang.
  if (freeOrder) after(() => notifyOrder(orderId, "paid"));
  else if (!snap) after(() => notifyOrder(orderId, "new"));

  revalidatePath("/request");
  revalidatePath("/dashboard");
  revalidatePath("/order");
  revalidatePath("/", "layout");
  return {
    ok: true,
    snapToken: snap?.token ?? null,
    snapRedirectUrl: snap?.redirectUrl ?? null,
    requestId: orderId,
  };
}

// Tujuan balik dari halaman Snap: /order?sync=<id> — param sync dipakai
// halaman Order untuk langsung mencocokkan status bayar ke Midtrans.
function orderFinishUrl(orderId: string) {
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  return appUrl ? `${appUrl}/order?sync=${orderId}` : undefined;
}

// Dipanggil callback Snap (onSuccess/onPending) setelah owner bayar:
// verifikasi status ke Midtrans (jangan percaya client), tandai PAID,
// lalu kirim notif "lunas". Pengganti webhook di localhost; di produksi
// webhook tetap jalan — idempoten, notif cuma sekali (updateMany guard).
export async function syncOrderPayment(requestId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) return;

  const req = await prisma.request.findUnique({ where: { id: requestId } });
  if (!req || req.storeId !== user.ownedStore.id) return;
  if (req.paymentStatus === "PAID") return;

  if (!(await isTransactionPaid(requestId))) return;

  const res = await prisma.request.updateMany({
    where: { id: requestId, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (res.count > 0) {
    after(() => notifyOrder(requestId, "paid"));
    revalidatePath("/order");
    revalidatePath("/request");
    revalidatePath("/", "layout");
  }
}

// Owner membayar order yang masih UNPAID dari riwayat order.
// Mengembalikan token Snap tersimpan; kalau belum ada (order dibuat sebelum
// Midtrans dikonfigurasi), buatkan transaksi baru lalu simpan tokennya.
export async function getOrderPayToken(requestId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa membayar order." };
  }

  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { items: { include: { product: true } } },
  });
  if (!req || req.storeId !== user.ownedStore.id) {
    return { error: "Order tidak ditemukan." };
  }
  if (req.paymentStatus === "PAID") return { error: "Order sudah lunas." };
  if (req.items.length === 0 || req.total <= 0) {
    return { error: "Order ini tidak punya tagihan." };
  }

  // Self-heal: mungkin sudah dibayar tapi callback/webhook tidak sampai
  // (mis. popup ditutup setelah sukses, atau bayar VA yang lunasnya nyusul).
  // Cek dulu ke Midtrans sebelum buka popup — kalau lunas, tandai + notif.
  if (await isTransactionPaid(req.id)) {
    const res = await prisma.request.updateMany({
      where: { id: req.id, paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID" },
    });
    if (res.count > 0) {
      after(() => notifyOrder(req.id, "paid"));
      revalidatePath("/order");
      revalidatePath("/request");
      revalidatePath("/", "layout");
    }
    return { paid: true as const };
  }

  if (req.snapToken) {
    return {
      ok: true as const,
      snapToken: req.snapToken,
      snapRedirectUrl: snapRedirectUrl(req.snapToken),
    };
  }

  const snap = await createSnapTransaction({
    orderId: req.id,
    grossAmount: req.total,
    customerName: user.name,
    items: [
      ...req.items.map((i) => ({
        id: i.productId,
        price: i.price,
        quantity: i.qty,
        name: i.product.name,
      })),
      // Diskon voucher ikut sebagai item minus agar jumlah = gross_amount
      ...(req.discount > 0
        ? [
            {
              id: "VOUCHER",
              price: -req.discount,
              quantity: 1,
              name: `Diskon voucher ${req.voucherCode ?? ""}`.trim(),
            },
          ]
        : []),
    ],
    finishUrl: orderFinishUrl(req.id),
  });
  if (!snap) {
    return { error: "Pembayaran online belum tersedia, hubungi sales." };
  }
  await prisma.request.update({
    where: { id: req.id },
    data: { snapToken: snap.token },
  });
  return {
    ok: true as const,
    snapToken: snap.token,
    snapRedirectUrl: snap.redirectUrl,
  };
}

// Owner mengajukan request bebas (mis. minta dikunjungi)
export async function createRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa mengajukan request." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) {
    return { error: "Judul dan isi request wajib diisi." };
  }

  await prisma.request.create({
    data: {
      storeId: user.ownedStore.id,
      subject,
      message,
      createdById: user.id,
    },
  });
  revalidatePath("/request");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Sales (pemegang toko) atau admin menandai status request.
// Alur order restok: PENDING (menunggu) → SHIPPED (dikirim, owner dapat
// notif "sedang dikirim") → COMPLETED (sampai, via report). Saat ditandai
// selesai stok ikut dipindahkan: stok pusat berkurang, stok toko bertambah.
export async function updateRequestStatus(id: string, status: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["PENDING", "SHIPPED", "COMPLETED"].includes(status)) return;

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true, items: true },
  });
  if (!req) return;

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) return;

  const fulfilling =
    status === "COMPLETED" && req.status !== "COMPLETED" && req.items.length > 0;

  // Transaksi batch (tanpa query baca di tengah) supaya tidak kena timeout
  // transaksi interaktif — latensi ke DB bisa tinggi.
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.request.update({ where: { id }, data: { status } }),
  ];
  if (fulfilling) ops.push(...stockMoveOps(req));
  await prisma.$transaction(ops);

  // Riwayat funnel ikut mencatat barang yang masuk
  if (fulfilling) after(() => logRestockArrival(req));

  // Owner dikabari begitu barangnya mulai dikirim
  if (status === "SHIPPED" && req.status !== "SHIPPED" && req.items.length > 0) {
    after(() => notifyOrder(id, "shipped"));
  }

  revalidateOrderPaths(req.storeId);
}

// Sales/admin menyelesaikan order restok DENGAN report pengiriman:
// foto barang + keterangan — bukti ke owner bahwa barang sudah sampai.
// Stok ikut dipindahkan seperti updateRequestStatus COMPLETED.
export async function completeOrderWithReport(id: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true, items: true },
  });
  if (!req) return { error: "Order tidak ditemukan." };

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) return { error: "Order ini bukan dari toko yang kamu pegang." };
  if (req.status === "COMPLETED") return { error: "Order sudah selesai." };

  const photo = String(formData.get("photo") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (photo && !photo.startsWith("data:image/")) {
    return { error: "Foto tidak valid, coba pilih ulang." };
  }

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.request.update({
      where: { id },
      data: {
        status: "COMPLETED",
        deliveryPhoto: photo || null,
        deliveryNote: note || null,
        deliveredAt: new Date(),
        deliveredBy: user.name,
      },
    }),
  ];
  if (req.items.length > 0) ops.push(...stockMoveOps(req));
  await prisma.$transaction(ops);

  // Riwayat funnel ikut mencatat barang yang masuk
  if (req.items.length > 0) after(() => logRestockArrival(req));

  // Kabari owner: barangnya sudah sampai (WA + push kalau aktif)
  after(() => notifyOrder(id, "delivered"));

  revalidateOrderPaths(req.storeId);
  return { ok: true };
}

// Op pemindahan stok saat order restok diselesaikan: stok pusat berkurang,
// stok toko (prospek) bertambah. Kurangi stok pusat tanpa sampai minus:
// (1) kalau stok < qty, nol-kan; (2) kalau cukup, kurangi qty.
// Urutannya penting — kebalikannya bisa meng-nol-kan stok yang cukup.
function stockMoveOps(req: {
  storeId: string;
  store: { salesId: string | null };
  items: { productId: string; qty: number }[];
}) {
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const item of req.items) {
    ops.push(
      prisma.product.updateMany({
        where: { id: item.productId, centralStock: { lt: item.qty } },
        data: { centralStock: 0 },
      }),
      prisma.product.updateMany({
        where: { id: item.productId, centralStock: { gte: item.qty } },
        data: { centralStock: { decrement: item.qty } },
      }),
      // Tambahkan ke stok toko
      prisma.prospect.upsert({
        where: {
          storeId_productId: {
            storeId: req.storeId,
            productId: item.productId,
          },
        },
        update: { stock: { increment: item.qty } },
        create: {
          storeId: req.storeId,
          productId: item.productId,
          stage: "ACTION",
          stock: item.qty,
          salesId: req.store.salesId,
        },
      }),
      // Barang masuk = toko sudah membeli → tahap funnel naik minimal ke
      // ACTION (yang sudah LOYALTY tidak diturunkan). Tanpa ini, prospek
      // lama bisa nyangkut di AWARENESS padahal stoknya jalan terus.
      prisma.prospect.updateMany({
        where: {
          storeId: req.storeId,
          productId: item.productId,
          stage: { in: ["AWARENESS", "INTEREST", "DESIRE"] },
        },
        data: { stage: "ACTION" },
      }),
    );
  }
  return ops;
}

// Catat kedatangan restok sebagai log funnel (ACTION/POSITIVE) supaya
// riwayat "Catat Kunjungan / Update Funnel" di detail konter nyambung
// dengan barang yang benar-benar masuk lewat order.
async function logRestockArrival(req: {
  id: string;
  storeId: string;
  store: { salesId: string | null };
  items: { productId: string; qty: number }[];
}) {
  const prospects = await prisma.prospect.findMany({
    where: {
      storeId: req.storeId,
      productId: { in: req.items.map((i) => i.productId) },
    },
    select: { id: true, productId: true },
  });
  if (prospects.length === 0) return;
  const qtyOf = new Map(req.items.map((i) => [i.productId, i.qty]));
  await prisma.stageLog.createMany({
    data: prospects.map((p) => ({
      prospectId: p.id,
      stage: "ACTION",
      result: "POSITIVE",
      note: `Restok masuk dari order #${req.id.slice(-8).toUpperCase()}`,
      quantity: qtyOf.get(p.productId) ?? 0,
      salesId: req.store.salesId,
    })),
  });
}

function revalidateOrderPaths(storeId: string) {
  revalidatePath("/request");
  revalidatePath("/order");
  revalidatePath("/data");
  revalidatePath("/pos");
  revalidatePath("/stok");
  revalidatePath(`/konter/${storeId}`);
  revalidatePath("/", "layout");
}
