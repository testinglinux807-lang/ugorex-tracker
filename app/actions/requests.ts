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
  chargeCard,
  chargeGopay,
  chargeQris,
  chargeVA,
  isTransactionPaid,
  type ChargeItem,
} from "@/lib/midtrans";
import { paymentFee } from "@/lib/payment-fee";
import { findUsableVoucher, consumeVoucher } from "@/lib/voucher";
import { voucherDiscount } from "@/lib/voucher-calc";

const PAYMENT_METHODS = new Set([
  "VA_BCA",
  "VA_BNI",
  "VA_BRI",
  "VA_PERMATA",
  "QRIS",
  "GOPAY",
  "DANA",
  "CARD",
  "CASH",
]);

function bankOf(method: string): "bca" | "bni" | "bri" | "permata" {
  return method.replace("VA_", "").toLowerCase() as
    | "bca"
    | "bni"
    | "bri"
    | "permata";
}

// Charge Core API sesuai metode yang dipilih. CARD butuh token kartu yang
// sudah ditokenisasi di client (MidtransNew3ds.getCardToken) — dikirim lewat
// formData "cardToken". CASH tidak melalui Midtrans sama sekali.
async function chargeByMethod(
  method: string,
  cardToken: string | null,
  params: {
    orderId: string;
    grossAmount: number;
    customerName: string;
    items: ChargeItem[];
  },
) {
  // DANA di Midtrans tidak punya payment_type sendiri — dibayar via QRIS
  // (app DANA scan QR yang sama). Jadi charge-nya QRIS, cuma label metodenya
  // yang "DANA" biar jelas di UI.
  if (method === "QRIS" || method === "DANA") return chargeQris(params);
  if (method === "GOPAY") return chargeGopay(params);
  if (method === "CARD") {
    if (!cardToken) return null;
    return chargeCard({ ...params, tokenId: cardToken });
  }
  return chargeVA({ ...params, bank: bankOf(method) });
}

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

  // Voucher (opsional) — validasi ulang di server, preview di client tidak
  // dipercaya. Kuota BELUM dikonsumsi di sini — baru dikonsumsi setelah
  // charge Midtrans berhasil (di bawah), supaya charge yang gagal tidak
  // membakar kuota voucher untuk order yang batal.
  const voucherCodeRaw = String(formData.get("voucherCode") ?? "").trim();
  let discount = 0;
  let voucherCode: string | null = null;
  let voucher: { id: string; maxUses: number | null } | null = null;
  if (voucherCodeRaw) {
    const found = await findUsableVoucher(voucherCodeRaw);
    if ("error" in found) return { error: found.error };
    discount = voucherDiscount(found.voucher!, subtotal);
    voucherCode = found.voucher!.code;
    voucher = found.voucher!;
  }
  const total = subtotal - discount;

  const method = String(formData.get("paymentMethod") ?? "");
  if (!PAYMENT_METHODS.has(method)) {
    return { error: "Pilih metode pembayaran." };
  }

  // Diskon penuh (total 0) = tidak ada yang perlu dibayar → langsung lunas,
  // metode/fee tidak relevan karena tidak ada yang dicharge ke Midtrans.
  const freeOrder = total === 0;
  const fee = freeOrder || method === "CASH" ? 0 : paymentFee(method, total);
  const grandTotal = total + fee;

  // ID order dibuat di muka supaya charge Midtrans + insert DB cukup dua
  // network call berurutan (Midtrans lalu Neon) — tanpa update terpisah
  // untuk menyimpan hasilnya. Latensi checkout didominasi dua call ini.
  const orderId = randomUUID();

  const chargeItems: ChargeItem[] = [
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
    ...(fee > 0
      ? [{ id: "FEE", price: fee, quantity: 1, name: "Biaya layanan" }]
      : []),
  ];

  // Charge langsung ke metode yang dipilih (null kalau Midtrans belum
  // dikonfigurasi, gagal, CASH, atau order gratis penuh).
  const charge =
    !freeOrder && method !== "CASH"
      ? await chargeByMethod(
          method,
          String(formData.get("cardToken") ?? "") || null,
          {
            orderId,
            grossAmount: grandTotal,
            customerName: user.name,
            items: chargeItems,
          },
        )
      : null;
  if (!freeOrder && method !== "CASH" && !charge) {
    return { error: "Gagal membuat tagihan pembayaran, coba lagi." };
  }

  // Charge (atau fallback CASH/gratis) berhasil — baru sekarang konsumsi
  // kuota voucher, atomik terhadap pemakaian bersamaan.
  if (voucher && !(await consumeVoucher(voucher))) {
    return { error: "Kuota voucher sudah habis." };
  }

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
      paymentMethod: method,
      paymentFee: fee,
      txnId: orderId,
      vaNumber: charge?.vaNumber ?? null,
      vaBank: charge?.vaBank ?? null,
      qrUrl: charge?.qrUrl ?? null,
      paymentDeeplink: charge?.deeplink ?? null,
      paymentExpiry: charge?.expiryTime ? new Date(charge.expiryTime) : null,
      items: { create: itemRows },
    },
  });

  // Order gratis penuh atau CASH: tidak ada yang perlu ditunggu dari
  // Midtrans, kabari sekarang. Metode online lain menunggu konfirmasi
  // pembayaran (polling / getOrderPaymentInfo self-heal).
  if (freeOrder) after(() => notifyOrder(orderId, "paid"));
  else if (method === "CASH") after(() => notifyOrder(orderId, "new"));

  revalidatePath("/request");
  revalidatePath("/dashboard");
  revalidatePath("/order");
  revalidatePath("/", "layout");
  return {
    ok: true,
    requestId: orderId,
    paymentMethod: method,
    freeOrder,
    grandTotal,
    vaNumber: charge?.vaNumber ?? null,
    vaBank: charge?.vaBank ?? null,
    qrUrl: charge?.qrUrl ?? null,
    deeplink: charge?.deeplink ?? null,
    redirectUrl: charge?.redirectUrl ?? null,
    paymentExpiry: charge?.expiryTime ?? null,
  };
}

// Dipanggil client setelah owner bayar / saat polling instruksi pembayaran:
// verifikasi status ke Midtrans (jangan percaya client), tandai PAID, lalu
// kirim notif "lunas". Idempoten (updateMany guard) — aman dipanggil berkali.
export async function syncOrderPayment(requestId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) return;

  const req = await prisma.request.findUnique({ where: { id: requestId } });
  if (!req || req.storeId !== user.ownedStore.id) return;
  if (req.paymentStatus === "PAID") return;

  if (!(await isTransactionPaid(req.txnId ?? req.id))) return;

  const res = await prisma.request.updateMany({
    where: { id: requestId, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (res.count > 0) {
    after(() => notifyOrder(requestId, "paid"));
    revalidateOrderPaths(req.storeId);
  }
}

// Cek ringan status lunas — dipakai polling di panel instruksi pembayaran
// setelah syncOrderPayment supaya UI tahu kapan harus berhenti & tutup panel.
export async function getOrderPaidStatus(requestId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !user.ownedStore) return false;
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    select: { paymentStatus: true, storeId: true },
  });
  if (!req || req.storeId !== user.ownedStore.id) return false;
  return req.paymentStatus === "PAID";
}

// Owner membuka instruksi pembayaran order yang masih UNPAID dari riwayat
// order. Kalau charge sebelumnya masih berlaku, tampilkan ulang info yang
// sama; kalau kedaluwarsa, buat ulang tagihan (order_id Midtrans baru —
// tidak bisa dipakai ulang bebas begitu charge pertama kedaluwarsa/gagal).
export async function getOrderPaymentInfo(requestId: string) {
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
  if (!req.paymentMethod || req.paymentMethod === "CASH") {
    return { error: "Order ini dibayar cash, tidak ada pembayaran online." };
  }
  if (req.items.length === 0 || req.total <= 0) {
    return { error: "Order ini tidak punya tagihan." };
  }

  // Self-heal: mungkin sudah dibayar tapi status belum sempat sinkron.
  if (await isTransactionPaid(req.txnId ?? req.id)) {
    const res = await prisma.request.updateMany({
      where: { id: req.id, paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID" },
    });
    if (res.count > 0) {
      after(() => notifyOrder(req.id, "paid"));
      revalidateOrderPaths(req.storeId);
    }
    return { paid: true as const };
  }

  const grandTotal = req.total + req.paymentFee;

  // Charge sebelumnya masih berlaku → tampilkan ulang instruksi yang sama,
  // tanpa memanggil Midtrans lagi.
  if (req.paymentExpiry && req.paymentExpiry > new Date()) {
    return {
      ok: true as const,
      paymentMethod: req.paymentMethod,
      vaNumber: req.vaNumber,
      vaBank: req.vaBank,
      qrUrl: req.qrUrl,
      deeplink: req.paymentDeeplink,
      paymentExpiry: req.paymentExpiry.toISOString(),
      grandTotal,
    };
  }

  if (req.paymentMethod === "CARD") {
    return { error: "Tagihan kartu kedaluwarsa, checkout ulang dari awal." };
  }

  const newTxnId = `${req.id}-r${Date.now().toString(36)}`;
  const chargeItems: ChargeItem[] = [
    ...req.items.map((i) => ({
      id: i.productId,
      price: i.price,
      quantity: i.qty,
      name: i.product.name,
    })),
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
    ...(req.paymentFee > 0
      ? [{ id: "FEE", price: req.paymentFee, quantity: 1, name: "Biaya layanan" }]
      : []),
  ];
  const charge = await chargeByMethod(req.paymentMethod, null, {
    orderId: newTxnId,
    grossAmount: grandTotal,
    customerName: user.name,
    items: chargeItems,
  });
  if (!charge) {
    return { error: "Pembayaran online belum tersedia, hubungi sales." };
  }

  await prisma.request.update({
    where: { id: req.id },
    data: {
      txnId: newTxnId,
      vaNumber: charge.vaNumber ?? null,
      vaBank: charge.vaBank ?? null,
      qrUrl: charge.qrUrl ?? null,
      paymentDeeplink: charge.deeplink ?? null,
      paymentExpiry: charge.expiryTime ? new Date(charge.expiryTime) : null,
    },
  });
  return {
    ok: true as const,
    paymentMethod: req.paymentMethod,
    vaNumber: charge.vaNumber ?? null,
    vaBank: charge.vaBank ?? null,
    qrUrl: charge.qrUrl ?? null,
    deeplink: charge.deeplink ?? null,
    paymentExpiry: charge.expiryTime ?? null,
    grandTotal,
  };
}

// Sales/admin menandai order CASH sebagai lunas — dipakai saat owner
// membayar tunai langsung ke sales pas barang sampai.
export async function markOrderPaidCash(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true },
  });
  if (!req) return { error: "Order tidak ditemukan." };

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) return { error: "Order ini bukan dari toko yang kamu pegang." };
  if (req.paymentMethod !== "CASH") {
    return { error: "Order ini bukan pembayaran cash." };
  }
  if (req.paymentStatus === "PAID") return { error: "Order sudah lunas." };

  const res = await prisma.request.updateMany({
    where: { id, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (res.count > 0) {
    after(() => notifyOrder(id, "paid"));
    revalidateOrderPaths(req.storeId);
  }
  return { ok: true };
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
