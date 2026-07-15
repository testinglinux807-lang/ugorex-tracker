"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { findUsableVoucher, consumeVoucher } from "@/lib/voucher";
import { voucherDiscount } from "@/lib/voucher-calc";

// Owner mencatat transaksi penjualan (POS) — bisa beberapa barang sekaligus
// dalam satu keranjang (key: qty__<productId> + price__<productId>).
export async function createSale(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa mencatat penjualan." };
  }

  const lines: { productId: string; qty: number; price: number }[] = [];
  for (const [key, val] of formData.entries()) {
    if (!key.startsWith("qty__")) continue;
    const productId = key.slice(5);
    const qty = parseInt(String(val), 10) || 0;
    const price =
      parseInt(String(formData.get(`price__${productId}`) ?? "0"), 10) || 0;
    if (qty > 0) lines.push({ productId, qty, price });
  }
  if (lines.length === 0) {
    return { error: "Pilih minimal satu barang." };
  }
  if (lines.some((l) => l.price <= 0)) {
    return { error: "Harga tiap barang wajib diisi (> 0)." };
  }

  const ids = lines.map((l) => l.productId);
  const products = await prisma.product.findMany({ where: { id: { in: ids } } });
  if (products.length !== lines.length) {
    return { error: "Ada barang yang tidak valid." };
  }
  const productOf = new Map(products.map((p) => [p.id, p]));

  // Validasi stok per barang: tidak boleh jual melebihi sisa stok toko
  const storeId = user.ownedStore.id;
  const [prospects, sold] = await Promise.all([
    prisma.prospect.findMany({
      where: { storeId, productId: { in: ids } },
    }),
    prisma.sale.groupBy({
      by: ["productId"],
      where: { storeId, productId: { in: ids } },
      _sum: { qty: true },
    }),
  ]);
  const stockBy = new Map(prospects.map((p) => [p.productId, p.stock]));
  const soldBy = new Map(sold.map((s) => [s.productId, s._sum.qty ?? 0]));
  for (const line of lines) {
    const name = productOf.get(line.productId)!.name;
    const remaining =
      (stockBy.get(line.productId) ?? 0) - (soldBy.get(line.productId) ?? 0);
    if (remaining <= 0) {
      return { error: `Stok ${name} habis (sisa 0). Minta restok ke sales.` };
    }
    if (line.qty > remaining) {
      return { error: `Stok tidak cukup. Sisa ${name}: ${remaining}.` };
    }
  }

  // Voucher (opsional): potongan dibagi proporsional ke tiap baris supaya
  // laporan pendapatan per barang tetap konsisten; sisa pembulatan masuk
  // ke baris terakhir.
  const subtotal = lines.reduce((a, l) => a + l.qty * l.price, 0);
  const voucherCodeRaw = String(formData.get("voucherCode") ?? "").trim();
  let discount = 0;
  if (voucherCodeRaw) {
    const found = await findUsableVoucher(voucherCodeRaw);
    if ("error" in found) return { error: found.error };
    discount = voucherDiscount(found.voucher!, subtotal);
    if (!(await consumeVoucher(found.voucher!))) {
      return { error: "Kuota voucher sudah habis." };
    }
  }
  let sisa = discount;
  const rows = lines.map((l, i) => {
    const lineTotal = l.qty * l.price;
    const share =
      i === lines.length - 1
        ? sisa
        : Math.floor((discount * lineTotal) / (subtotal || 1));
    sisa -= share;
    return {
      storeId,
      productId: l.productId,
      productName: productOf.get(l.productId)!.name,
      qty: l.qty,
      price: l.price,
      discount: share,
      total: lineTotal - share,
      createdById: user.id,
    };
  });

  await prisma.sale.createMany({ data: rows });

  // Simpan harga satuan terakhir ke Prospect.price — jadi prefill harga di
  // POS untuk transaksi berikutnya (form "atur harga jual" di /stok dihapus,
  // harga langganan belajar otomatis dari transaksi nyata).
  await Promise.all(
    lines.map((l) =>
      prisma.prospect.update({
        where: { storeId_productId: { storeId, productId: l.productId } },
        data: { price: l.price },
      }),
    ),
  );

  revalidatePath("/pos");
  revalidatePath("/stok");
  return { ok: true };
}

// Edit oleh owner (koreksi stok & atur harga) DIHAPUS dari /stok — rawan
// disalahgunakan. Kalau stok fisik tidak sinkron / kurang / lebih, owner
// mengajukan lewat halaman Tiket Keluhan (diproses 1–2 hari kerja). Harga
// jual tersimpan otomatis dari transaksi POS terakhir.
