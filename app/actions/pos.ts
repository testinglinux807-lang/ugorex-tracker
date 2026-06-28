"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Owner mencatat transaksi penjualan (POS)
export async function createSale(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa mencatat penjualan." };
  }

  const productId = String(formData.get("productId") ?? "");
  const qty = parseInt(String(formData.get("qty") ?? "0"), 10) || 0;
  const price = parseInt(String(formData.get("price") ?? "0"), 10) || 0;
  if (!productId || qty <= 0 || price <= 0) {
    return { error: "Barang, jumlah, dan harga wajib diisi (> 0)." };
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "Barang tidak ditemukan." };

  // Validasi stok: tidak boleh jual lebih dari sisa stok yang dikasih sales
  const storeId = user.ownedStore.id;
  const prospect = await prisma.prospect.findUnique({
    where: { storeId_productId: { storeId, productId } },
  });
  const sold = await prisma.sale.aggregate({
    where: { storeId, productId },
    _sum: { qty: true },
  });
  const stock = prospect?.stock ?? 0;
  const remaining = stock - (sold._sum.qty ?? 0);
  if (remaining <= 0) {
    return { error: `Stok ${product.name} habis (sisa 0). Minta restok ke sales.` };
  }
  if (qty > remaining) {
    return { error: `Stok tidak cukup. Sisa ${product.name}: ${remaining}.` };
  }

  await prisma.sale.create({
    data: {
      storeId: user.ownedStore.id,
      productId: product.id,
      productName: product.name,
      qty,
      price,
      total: qty * price,
      createdById: user.id,
    },
  });
  revalidatePath("/pos");
  return { ok: true };
}
