"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { notifyOrder } from "@/lib/wa-notify";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createSnapTransaction } from "@/lib/midtrans";

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
  const total = itemRows.reduce((a, i) => a + i.qty * i.price, 0);

  const request = await prisma.request.create({
    data: {
      storeId: user.ownedStore.id,
      subject: `Restok ${items.length} barang`,
      message: note || summary,
      createdById: user.id,
      total,
      items: { create: itemRows },
    },
  });

  // Buat transaksi Midtrans Snap (null kalau kunci belum dikonfigurasi)
  const snapToken = await createSnapTransaction({
    orderId: request.id,
    grossAmount: total,
    customerName: user.name,
    items: itemRows.map((i) => ({
      id: i.productId,
      price: i.price,
      quantity: i.qty,
      name: productOf.get(i.productId)!.name,
    })),
  });

  // Kalau Midtrans aktif, notifikasi WA dikirim oleh webhook saat lunas
  // (satu kali kabar saja). Tanpa Midtrans, kabari sekarang.
  if (!snapToken) after(() => notifyOrder(request.id, "new"));

  revalidatePath("/request");
  revalidatePath("/dashboard");
  revalidatePath("/order");
  revalidatePath("/", "layout");
  return { ok: true, snapToken };
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
// Untuk request restok, saat ditandai selesai stok ikut dipindahkan:
// stok pusat berkurang, stok toko (prospek) bertambah.
export async function updateRequestStatus(id: string, status: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["PENDING", "COMPLETED"].includes(status)) return;

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
  if (fulfilling) {
    for (const item of req.items) {
      // Kurangi stok pusat, tidak sampai minus kalau stok sudah berubah:
      // (1) kalau stok < qty, nol-kan; (2) kalau cukup, kurangi qty.
      // Urutannya penting — kebalikannya bisa meng-nol-kan stok yang cukup.
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
      );
    }
  }
  await prisma.$transaction(ops);

  revalidatePath("/request");
  revalidatePath("/order");
  revalidatePath("/data");
  revalidatePath("/pos");
  revalidatePath("/stok");
  revalidatePath(`/konter/${req.storeId}`);
  revalidatePath("/", "layout");
}
