"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { notifyStockEmpty } from "@/lib/wa-notify";
import { findUsableVoucher, consumeVoucher } from "@/lib/voucher";
import {
  applyVouchers,
  voucherScopeKey,
  voucherLabel,
  type VoucherLike,
} from "@/lib/voucher-calc";

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

  // Voucher (opsional, maks 3 - satu per jenis FREE/PERCENT/FIXED): potongan
  // per baris diambil dari lib/voucher-calc.ts applyVouchers (urutan FREE →
  // PERCENT → FIXED, satu sumber sama dgn order restok).
  const voucherCodesRaw = [
    ...new Set(
      formData
        .getAll("voucherCode")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
  let perLine = new Map<string, number>();
  if (voucherCodesRaw.length > 3) {
    return { error: "Maksimal 3 voucher sekaligus." };
  }
  if (voucherCodesRaw.length > 0) {
    const found = await Promise.all(
      voucherCodesRaw.map((code) => findUsableVoucher(code)),
    );
    const firstError = found.find((f) => "error" in f);
    if (firstError && "error" in firstError) return { error: firstError.error };
    const resolved = found.map((f) => f.voucher!);
    const typeSeen = new Set<string>();
    for (const v of resolved) {
      if (typeSeen.has(v.type)) {
        return { error: `Cuma boleh 1 voucher jenis ${voucherLabel(v)} sekaligus.` };
      }
      typeSeen.add(v.type);
      if (v.productId) {
        const scopeKey = voucherScopeKey({
          id: v.productId,
          code: v.product?.code ?? null,
        });
        const matches = lines.some(
          (l) =>
            voucherScopeKey({
              id: l.productId,
              code: productOf.get(l.productId)?.code ?? null,
            }) === scopeKey,
        );
        if (!matches) {
          return {
            error: `Voucher ${v.code} cuma berlaku untuk produk ${
              v.product?.name ?? "tertentu"
            } - tambahkan dulu ke keranjang.`,
          };
        }
      }
    }
    const voucherLikes: VoucherLike[] = resolved.map((v) => ({
      code: v.code,
      type: v.type,
      value: v.value,
      productId: v.productId,
      productCode: v.product?.code ?? null,
    }));
    const itemsForCalc = lines.map((l) => ({
      ...l,
      code: productOf.get(l.productId)?.code ?? null,
    }));
    const result = applyVouchers(voucherLikes, itemsForCalc);
    perLine = result.perLine;
    for (const v of resolved) {
      if (!(await consumeVoucher(v))) {
        return { error: `Kuota voucher ${v.code} sudah habis.` };
      }
    }
  }

  // Bagikan potongan per scope-key (kode/produk) ke baris-baris yang
  // sekode - proporsional kalau lebih dari satu baris berbagi kode yang sama.
  const byKey = new Map<string, typeof lines>();
  for (const l of lines) {
    const key = voucherScopeKey({
      id: l.productId,
      code: productOf.get(l.productId)?.code ?? null,
    });
    const arr = byKey.get(key) ?? [];
    arr.push(l);
    byKey.set(key, arr);
  }
  const rows: {
    storeId: string;
    productId: string;
    productName: string;
    qty: number;
    price: number;
    discount: number;
    total: number;
    createdById: string;
  }[] = [];
  for (const [key, group] of byKey) {
    const keyTotal = perLine.get(key) ?? 0;
    const groupTotal = group.reduce((a, l) => a + l.qty * l.price, 0);
    let sisa = keyTotal;
    group.forEach((l, i) => {
      const lineTotal = l.qty * l.price;
      const share =
        i === group.length - 1
          ? sisa
          : Math.min(
              lineTotal,
              Math.floor((keyTotal * lineTotal) / (groupTotal || 1)),
            );
      sisa -= share;
      rows.push({
        storeId,
        productId: l.productId,
        productName: productOf.get(l.productId)!.name,
        qty: l.qty,
        price: l.price,
        discount: share,
        total: lineTotal - share,
        createdById: user.id,
      });
    });
  }

  await prisma.sale.createMany({ data: rows });

  // Rolling restock: barang yang sisa stoknya jadi 0 karena transaksi ini →
  // tugas follow-up + notif ke sales pemegang konter (slot kosong harus
  // segera diisi lagi). Validasi di atas menjamin qty ≤ remaining.
  const zeroed = lines
    .filter(
      (l) =>
        (stockBy.get(l.productId) ?? 0) -
          (soldBy.get(l.productId) ?? 0) -
          l.qty <=
        0,
    )
    .map((l) => l.productId);
  if (zeroed.length > 0) {
    after(() => notifyStockEmpty(storeId, zeroed));
  }

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
  revalidatePath("/order");
  return { ok: true };
}

// Edit oleh owner (koreksi stok & atur harga) DIHAPUS dari /stok — rawan
// disalahgunakan. Kalau stok fisik tidak sinkron / kurang / lebih, owner
// mengajukan lewat halaman Tiket Keluhan (diproses 1–2 hari kerja). Harga
// jual tersimpan otomatis dari transaksi POS terakhir.
