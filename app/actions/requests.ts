"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyOrder, notifyRequestReply } from "@/lib/wa-notify";
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
import {
  voucherDiscount,
  grosirTierFor,
  grosirDiscount,
} from "@/lib/voucher-calc";

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

  // Jumlah order tidak boleh melebihi stok pusat saat ini. Barang sekode
  // (mis. tempered glass yang cocok untuk beberapa tipe HP) berbagi satu
  // stok pusat fisik — qty barang-barang sekode dijumlahkan dulu sebelum
  // dibandingkan, supaya order 2 varian sekode tidak lolos padahal stoknya
  // cuma cukup untuk salah satu.
  const stockGroups = new Map<
    string,
    { stock: number; qty: number; label: string }
  >();
  for (const item of items) {
    const product = products.find((p) => p.id === item.productId)!;
    const key = product.code ?? `id:${product.id}`;
    const g = stockGroups.get(key) ?? {
      stock: product.centralStock,
      qty: 0,
      label: product.code ? `kode ${product.code}` : product.name,
    };
    g.qty += item.qty;
    g.stock = Math.max(g.stock, product.centralStock);
    stockGroups.set(key, g);
  }
  for (const g of stockGroups.values()) {
    if (g.qty > g.stock) {
      return {
        error: `Stok pusat ${g.label} tinggal ${g.stock}, kurangi jumlahnya.`,
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

  // Diskon grosir otomatis: total qty order mencapai tier (aturan admin di
  // menu Data) → potongan persen dari subtotal, tanpa kode apa pun.
  const totalQty = items.reduce((a, i) => a + i.qty, 0);
  const tiers = await prisma.grosirTier.findMany({ where: { active: true } });
  const grosirTier = grosirTierFor(tiers, totalQty);
  const grosir = grosirTier ? grosirDiscount(grosirTier, subtotal) : 0;

  // Voucher (opsional) — validasi ulang di server, preview di client tidak
  // dipercaya. Kuota BELUM dikonsumsi di sini — baru dikonsumsi setelah
  // charge Midtrans berhasil (di bawah), supaya charge yang gagal tidak
  // membakar kuota voucher untuk order yang batal. Voucher dihitung dari
  // sisa setelah potongan grosir (bisa digabung).
  const voucherCodeRaw = String(formData.get("voucherCode") ?? "").trim();
  let discount = 0;
  let voucherCode: string | null = null;
  let voucher: { id: string; maxUses: number | null } | null = null;
  if (voucherCodeRaw) {
    const found = await findUsableVoucher(voucherCodeRaw);
    if ("error" in found) return { error: found.error };
    discount = voucherDiscount(found.voucher!, subtotal - grosir);
    voucherCode = found.voucher!.code;
    voucher = found.voucher!;
  }
  const total = subtotal - grosir - discount;

  const method = String(formData.get("paymentMethod") ?? "");
  if (!PAYMENT_METHODS.has(method)) {
    return { error: "Pilih metode pembayaran." };
  }

  // freeOrder: tidak ada yang bisa dicharge ke Midtrans (total 0).
  // Lunas OTOMATIS hanya untuk diskon penuh sungguhan (subtotal > 0) via
  // metode online. CASH tidak pernah auto-lunas — dananya harus diterima
  // dulu oleh sales/admin (tombol Tandai Lunas). Total 0 karena HARGA
  // BARANG BELUM DIISI juga jangan dianggap lunas.
  const freeOrder = total === 0;
  const autoPaid = freeOrder && subtotal > 0 && method !== "CASH";
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
    ...(grosir > 0
      ? [
          {
            id: "GROSIR",
            price: -grosir,
            quantity: 1,
            name: `Diskon grosir ${grosirTier!.percent}% (min ${grosirTier!.minQty} pcs)`,
          },
        ]
      : []),
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

  // RESERVASI STOK: potong stok pusat SEKARANG, atomik lewat guard `gte`
  // di WHERE — dua toko rebutan sisa terakhir, yang kalah gagal DI SINI
  // sebelum ada uang yang dicharge (tidak perlu refund). Barang sekode
  // dipotong bersama (stok fisik yang sama, nilai di-mirror antar baris).
  // Stok balik kalau langkah setelahnya gagal / order dibatalkan.
  const reserved: { target: { code: string } | { id: string }; qty: number }[] =
    [];
  const undoReserve = () =>
    Promise.all(
      reserved.map((r) =>
        prisma.product.updateMany({
          where: r.target,
          data: { centralStock: { increment: r.qty } },
        }),
      ),
    );
  for (const [key, g] of stockGroups) {
    const target = key.startsWith("id:")
      ? { id: key.slice(3) }
      : { code: key };
    const res = await prisma.product.updateMany({
      where: { ...target, centralStock: { gte: g.qty } },
      data: { centralStock: { decrement: g.qty } },
    });
    if (res.count === 0) {
      await undoReserve();
      return {
        error: `Stok pusat ${g.label} keburu diambil order lain — sisanya tidak cukup, kurangi jumlahnya.`,
      };
    }
    reserved.push({ target, qty: g.qty });
  }

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
    await undoReserve();
    return { error: "Gagal membuat tagihan pembayaran, coba lagi." };
  }

  // Charge (atau fallback CASH/gratis) berhasil — baru sekarang konsumsi
  // kuota voucher, atomik terhadap pemakaian bersamaan.
  if (voucher && !(await consumeVoucher(voucher))) {
    await undoReserve();
    return { error: "Kuota voucher sudah habis." };
  }

  try {
    await prisma.request.create({
      data: {
        id: orderId,
        storeId: user.ownedStore.id,
        subject: `Restok ${items.length} barang`,
        message: note || summary,
        createdById: user.id,
        total,
        stockReserved: true,
        discount,
        grosirDiscount: grosir,
        voucherCode,
        paymentStatus: autoPaid ? "PAID" : "UNPAID",
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
  } catch {
    // Insert gagal (jaringan/DB) — jangan biarkan stok tersandera
    await undoReserve();
    return { error: "Gagal menyimpan order, coba lagi." };
  }

  // Order lunas otomatis / CASH / total 0: tidak ada yang perlu ditunggu
  // dari Midtrans, kabari sekarang. Metode online lain menunggu konfirmasi
  // pembayaran (polling / getOrderPaymentInfo self-heal).
  if (autoPaid) after(() => notifyOrder(orderId, "paid"));
  else if (method === "CASH" || freeOrder) {
    after(() => notifyOrder(orderId, "new"));
  }

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
// Return true kalau order ini (sudah / jadi) LUNAS — dipakai watcher &
// polling untuk tahu kapan perlu router.refresh(), tanpa refresh sia-sia
// (yang bisa memicu loop).
export async function syncOrderPayment(requestId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) return false;

  const req = await prisma.request.findUnique({ where: { id: requestId } });
  if (!req || req.storeId !== user.ownedStore.id) return false;
  if (req.status === "CANCELLED") return false;
  if (req.paymentStatus === "PAID") return true;

  if (!(await isTransactionPaid(req.txnId ?? req.id))) return false;

  const res = await prisma.request.updateMany({
    where: { id: requestId, paymentStatus: { not: "PAID" } },
    data: { paymentStatus: "PAID" },
  });
  if (res.count > 0) {
    after(() => notifyOrder(requestId, "paid"));
    revalidateOrderPaths(req.storeId);
  }
  return true;
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
  if (req.status === "CANCELLED") {
    return { error: "Order sudah dibatalkan, tidak bisa dibayar." };
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
  // Selain CASH, order bertotal 0 (harga barang belum diisi / diskon penuh
  // via CASH) juga dilunasi manual — Midtrans tidak bisa menagih Rp0.
  if (req.paymentMethod !== "CASH" && req.total + req.paymentFee > 0) {
    return { error: "Order ini bukan pembayaran cash." };
  }
  if (req.status === "CANCELLED") return { error: "Order sudah dibatalkan." };
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

// Owner mengajukan request bebas (mis. minta dikunjungi). Sales juga bisa —
// kadang konter menyampaikan keluhan langsung ke sales, jadi sales yang
// mencatatkan atas nama konter yang dia pegang (pilih konter di form).
export async function createRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let storeId: string;
  if (user.role === "OWNER") {
    if (!user.ownedStore) {
      return { error: "Akun ini belum terhubung ke toko." };
    }
    storeId = user.ownedStore.id;
  } else if (user.role === "SALES") {
    storeId = String(formData.get("storeId") ?? "");
    if (!storeId) return { error: "Pilih konter dulu." };
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { salesId: true },
    });
    if (!store || store.salesId !== user.id) {
      return { error: "Konter ini bukan tanggung jawabmu." };
    }
  } else {
    return { error: "Hanya owner toko atau sales yang bisa mengajukan request." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) {
    return { error: "Judul dan isi request wajib diisi." };
  }

  await prisma.request.create({
    data: {
      storeId,
      subject,
      message,
      createdById: user.id,
    },
  });
  revalidatePath("/request");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Sales (pemegang toko) atau admin membalas request bebas — balasan tampil
// di kartu request dan pembuatnya dikabari (in-app + WA + push).
export async function respondRequest(id: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true, items: { select: { id: true }, take: 1 } },
  });
  if (!req) return { error: "Request tidak ditemukan." };
  if (req.items.length > 0) {
    return { error: "Order restok tidak dibalas di sini." };
  }

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) return { error: "Request ini bukan dari toko yang kamu pegang." };

  const response = String(formData.get("response") ?? "").trim();
  if (!response) return { error: "Isi balasan dulu." };

  const roleLabel = user.role === "ADMIN" ? "Admin" : "Sales";
  await prisma.request.update({
    where: { id },
    data: {
      response,
      respondedBy: `${user.name} (${roleLabel})`,
      respondedAt: new Date(),
    },
  });

  // Kabari pembuat request — kecuali dia membalas request-nya sendiri
  if (req.createdById && req.createdById !== user.id) {
    after(() => notifyRequestReply(id));
  }
  revalidatePath("/request");
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
  // Order batal tidak bisa diproses lagi (stok reservasinya sudah balik)
  if (req.status === "CANCELLED") return;

  const fulfilling =
    status === "COMPLETED" && req.status !== "COMPLETED" && req.items.length > 0;

  // Transaksi batch (tanpa query baca di tengah) supaya tidak kena timeout
  // transaksi interaktif — latensi ke DB bisa tinggi.
  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.request.update({ where: { id }, data: { status } }),
  ];
  if (fulfilling) ops.push(...(await stockMoveOps(req)));
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
  if (req.status === "CANCELLED") return { error: "Order sudah dibatalkan." };

  const photo = String(formData.get("photo") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (photo && !photo.startsWith("data:image/")) {
    return { error: "Foto tidak valid, coba pilih ulang." };
  }

  // Snapshot pengantar + rolenya, biar jelas siapa yang input bukti (admin
  // atau sales, sekalian namanya). Hanya ADMIN/SALES yang lolos cek di atas.
  const roleLabel = user.role === "ADMIN" ? "Admin" : "Sales";

  const ops: Prisma.PrismaPromise<unknown>[] = [
    prisma.request.update({
      where: { id },
      data: {
        status: "COMPLETED",
        deliveryPhoto: photo || null,
        deliveryNote: note || null,
        deliveredAt: new Date(),
        deliveredBy: `${user.name} (${roleLabel})`,
      },
    }),
  ];
  if (req.items.length > 0) ops.push(...(await stockMoveOps(req)));
  await prisma.$transaction(ops);

  // Riwayat funnel ikut mencatat barang yang masuk
  if (req.items.length > 0) after(() => logRestockArrival(req));

  // Kabari owner: barangnya sudah sampai (WA + push kalau aktif)
  after(() => notifyOrder(id, "delivered"));

  revalidateOrderPaths(req.storeId);
  return { ok: true };
}

// Kembalikan stok pusat untuk item order yang stoknya sudah direservasi
// checkout — dipakai saat order dibatalkan / sweep tagihan kedaluwarsa.
// Barang sekode berbagi stok fisik: qty dijumlah per kode dulu, lalu
// increment di-mirror ke semua baris sekode (pola yang sama dgn stockMoveOps).
async function restoreCentralStock(
  items: { productId: string; qty: number }[],
) {
  const codeOf = new Map(
    (
      await prisma.product.findMany({
        where: { id: { in: items.map((i) => i.productId) } },
        select: { id: true, code: true },
      })
    ).map((p) => [p.id, p.code]),
  );
  const groups = new Map<string, number>();
  for (const it of items) {
    const code = codeOf.get(it.productId);
    const key = code ? `c:${code}` : `id:${it.productId}`;
    groups.set(key, (groups.get(key) ?? 0) + it.qty);
  }
  await Promise.all(
    [...groups].map(([key, qty]) =>
      prisma.product.updateMany({
        where: key.startsWith("c:")
          ? { code: key.slice(2) }
          : { id: key.slice(3) },
        data: { centralStock: { increment: qty } },
      }),
    ),
  );
}

// Batalkan order restok. Admin/sales pemegang toko: order apa pun yang belum
// selesai (order LUNAS pun bisa — refund uangnya diurus manual via dashboard
// Midtrans/kesepakatan). Owner: hanya order tokonya yang masih Menunggu dan
// BELUM dibayar. Stok pusat yang direservasi saat checkout dikembalikan;
// order lama (pra-skema reservasi) memang belum memotong stok, jadi tidak
// ada yang dikembalikan.
export async function cancelOrder(id: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true, items: true },
  });
  if (!req || req.items.length === 0) {
    return { error: "Order tidak ditemukan." };
  }
  if (req.status === "COMPLETED") {
    return { error: "Order sudah selesai, tidak bisa dibatalkan." };
  }
  if (req.status === "CANCELLED") return { error: "Order sudah dibatalkan." };

  const isStaff =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  const isOwnOrder =
    user.role === "OWNER" && user.ownedStore?.id === req.storeId;
  if (!isStaff && !isOwnOrder) {
    return { error: "Order ini bukan milikmu." };
  }
  if (!isStaff && (req.status !== "PENDING" || req.paymentStatus === "PAID")) {
    return {
      error: "Order sudah dibayar/diproses — hubungi sales untuk pembatalan.",
    };
  }

  const reason = String(formData.get("reason") ?? "").trim();
  const roleLabel =
    user.role === "ADMIN" ? "Admin" : user.role === "SALES" ? "Sales" : "Owner";

  // Guard status di WHERE: anti dobel-klik / balapan dengan proses kirim —
  // hanya transisi pertama yang menang. stockReserved ikut di-nol-kan
  // atomik di sini supaya stok tidak mungkin dikembalikan dua kali.
  const res = await prisma.request.updateMany({
    where: { id, status: { notIn: ["COMPLETED", "CANCELLED"] } },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledBy: `${user.name} (${roleLabel})`,
      cancelReason: reason || null,
      stockReserved: false,
    },
  });
  if (res.count === 0) {
    return { error: "Status order keburu berubah, muat ulang halaman." };
  }

  if (req.stockReserved) await restoreCentralStock(req.items);

  after(() => notifyOrder(id, "cancelled"));
  revalidateOrderPaths(req.storeId);
  return { ok: true };
}

// Admin menandai dana order batal sudah dikembalikan ke owner. Refund
// uangnya sendiri terjadi di luar app (dashboard Midtrans / transfer /
// tunai lewat sales) — ini pencatatan + kabar ke owner supaya jelas
// dananya sudah balik. Anti dobel lewat guard refundedAt null di WHERE.
export async function markOrderRefunded(id: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return { error: "Hanya admin yang bisa menandai pengembalian dana." };
  }

  const req = await prisma.request.findUnique({
    where: { id },
    include: { items: { select: { id: true }, take: 1 } },
  });
  if (!req || req.items.length === 0) {
    return { error: "Order tidak ditemukan." };
  }
  if (req.status !== "CANCELLED") {
    return { error: "Order ini tidak dibatalkan — tidak ada refund." };
  }
  if (req.paymentStatus !== "PAID") {
    return { error: "Order ini belum dibayar, tidak ada dana yang kembali." };
  }

  const note = String(formData.get("note") ?? "").trim();
  const res = await prisma.request.updateMany({
    where: { id, refundedAt: null },
    data: {
      refundedAt: new Date(),
      refundedBy: `${user.name} (Admin)`,
      refundNote: note || null,
    },
  });
  if (res.count === 0) return { error: "Refund sudah pernah ditandai." };

  after(() => notifyOrder(id, "refunded"));
  revalidateOrderPaths(req.storeId);
  return { ok: true };
}

// Order online yang tagihannya sudah kedaluwarsa > 24 jam dan tetap tidak
// dibayar dibatalkan otomatis supaya stok reservasinya tidak tersandera
// order zombie. Grace 24 jam memberi ruang owner "bayar ulang" (charge baru
// via getOrderPaymentInfo memperbarui paymentExpiry). Sebelum membatalkan,
// verifikasi dulu ke Midtrans — bisa saja sudah dibayar tapi webhook tidak
// sampai (kasus localhost). Dipanggil dari halaman /order tiap dibuka.
export async function sweepExpiredOrders() {
  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const candidates = await prisma.request.findMany({
    where: {
      status: "PENDING",
      paymentStatus: "UNPAID",
      paymentMethod: { not: "CASH" }, // CASH tanpa tagihan online, manual saja
      paymentExpiry: { lt: cutoff },
      items: { some: {} },
    },
    include: { items: true },
    take: 10, // sisanya kena sweep kunjungan berikutnya
  });

  for (const req of candidates) {
    // Self-heal: ternyata sudah dibayar → tandai lunas, jangan batalkan
    if (await isTransactionPaid(req.txnId ?? req.id)) {
      const res = await prisma.request.updateMany({
        where: { id: req.id, paymentStatus: { not: "PAID" } },
        data: { paymentStatus: "PAID" },
      });
      if (res.count > 0) after(() => notifyOrder(req.id, "paid"));
      continue;
    }
    const res = await prisma.request.updateMany({
      where: { id: req.id, status: "PENDING", paymentStatus: "UNPAID" },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "Sistem",
        cancelReason: "Tagihan tidak dibayar sampai kedaluwarsa",
        stockReserved: false,
      },
    });
    if (res.count > 0) {
      if (req.stockReserved) await restoreCentralStock(req.items);
      after(() => notifyOrder(req.id, "cancelled"));
    }
  }
  if (candidates.length > 0) revalidatePath("/order");
}

// Admin/sales membuka label resi order. Nomor resi + kode penjemputan
// dibuat sekali di klik pertama (idempoten), lalu diarahkan ke halaman
// cetak /order/[id]/resi. Kode penjemputan ditunjukkan sales yang jemput
// barang di gudang; juga tampil di kartu order (HP sales).
export async function printOrderResi(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true, items: { select: { id: true }, take: 1 } },
  });
  if (!req) return { error: "Order tidak ditemukan." };
  if (req.items.length === 0) {
    return { error: "Resi hanya untuk order restok." };
  }
  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) return { error: "Order ini bukan dari toko yang kamu pegang." };

  if (!req.resiNo) {
    const rand = (chars: string, n: number) =>
      Array.from(
        { length: n },
        () => chars[Math.floor(Math.random() * chars.length)],
      ).join("");
    const d = new Date();
    const ymd =
      String(d.getFullYear()).slice(2) +
      String(d.getMonth() + 1).padStart(2, "0") +
      String(d.getDate()).padStart(2, "0");
    // Retry kecil: resiNo unique — kalau kebetulan tabrakan, buat ulang
    for (let i = 0; i < 5; i++) {
      try {
        await prisma.request.update({
          where: { id },
          data: {
            resiNo: `UGX${ymd}${rand("0123456789", 6)}`,
            pickupCode: `${rand("ABCDEFGHJKLMNPQRSTUVWXYZ", 2)}-${rand("0123456789", 2)}`,
          },
        });
        break;
      } catch {
        if (i === 4) return { error: "Gagal membuat nomor resi, coba lagi." };
      }
    }
    revalidatePath("/order");
  }
  // ?auto=1 → halaman label langsung membuka dialog print/Save-as-PDF
  redirect(`/order/${id}/resi?auto=1`);
}

// Op pemindahan stok saat order restok diselesaikan: stok pusat berkurang,
// stok toko (prospek) bertambah. Order baru (stockReserved) stok pusatnya
// SUDAH dipotong saat checkout — di sini tinggal stok toko yang naik;
// order lama (pra-reservasi) tetap dipotong di sini seperti dulu.
// Kurangi stok pusat tanpa sampai minus:
// (1) kalau stok < qty, nol-kan; (2) kalau cukup, kurangi qty.
// Urutannya penting — kebalikannya bisa meng-nol-kan stok yang cukup.
// Barang sekode berbagi satu stok pusat fisik, jadi pengurangan berlaku ke
// SEMUA barang dengan kode itu (nilainya di-mirror antar baris sekode) —
// async karena perlu baca kode dulu, di luar transaksi batch.
async function stockMoveOps(req: {
  storeId: string;
  store: { salesId: string | null };
  items: { productId: string; qty: number }[];
  stockReserved: boolean;
}) {
  const codeOf = new Map(
    (
      await prisma.product.findMany({
        where: { id: { in: req.items.map((i) => i.productId) } },
        select: { id: true, code: true },
      })
    ).map((p) => [p.id, p.code]),
  );
  const target = (productId: string) => {
    const code = codeOf.get(productId);
    return code ? { code } : { id: productId };
  };
  const ops: Prisma.PrismaPromise<unknown>[] = [];
  for (const item of req.items) {
    if (!req.stockReserved) {
      ops.push(
        prisma.product.updateMany({
          where: { ...target(item.productId), centralStock: { lt: item.qty } },
          data: { centralStock: 0 },
        }),
        prisma.product.updateMany({
          where: { ...target(item.productId), centralStock: { gte: item.qty } },
          data: { centralStock: { decrement: item.qty } },
        }),
      );
    }
    ops.push(
      // Prospek yang sudah CONVERSION dan order lagi = repeat order →
      // naik ke LOYALTY. Harus jalan SEBELUM upsert/bump di bawah supaya
      // prospek yang baru masuk CONVERSION di order ini tidak langsung
      // ikut naik. STAR_SELLER tetap manual (sales/admin).
      prisma.prospect.updateMany({
        where: {
          storeId: req.storeId,
          productId: item.productId,
          stage: "CONVERSION",
        },
        data: { stage: "LOYALTY" },
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
          stage: "CONVERSION",
          stock: item.qty,
          salesId: req.store.salesId,
        },
      }),
      // Barang masuk = toko sudah membeli → tahap funnel naik minimal ke
      // CONVERSION (yang sudah LOYALTY/STAR_SELLER tidak diturunkan).
      // Tanpa ini, prospek lama bisa nyangkut di AWARENESS padahal
      // stoknya jalan terus.
      prisma.prospect.updateMany({
        where: {
          storeId: req.storeId,
          productId: item.productId,
          stage: { in: ["AWARENESS", "CONSIDERATION"] },
        },
        data: { stage: "CONVERSION" },
      }),
    );
  }
  return ops;
}

// Catat kedatangan restok sebagai log funnel (CONVERSION/POSITIVE) supaya
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
      stage: "CONVERSION",
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
