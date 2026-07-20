import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StockEditor } from "@/components/StockEditor";
import { ArrowRight, Info, ShoppingBag } from "lucide-react";

export default async function StokPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/");

  if (!user.ownedStore) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Akun ini belum terhubung ke toko. Hubungi sales/admin.
      </div>
    );
  }

  const storeId = user.ownedStore.id;
  // Terjual per barang dihitung di database (groupBy), bukan menarik semua
  // baris transaksi.
  const [products, sold, prospects] = await Promise.all([
    prisma.product.findMany({
      select: { id: true, name: true, code: true, price: true },
      orderBy: { name: "asc" },
    }),
    prisma.sale.groupBy({
      by: ["productId"],
      where: { storeId },
      _sum: { qty: true },
    }),
    prisma.prospect.findMany({ where: { storeId } }),
  ]);

  const stockByProduct = new Map<string, number>();
  const priceByProduct = new Map<string, number>();
  for (const p of prospects) {
    stockByProduct.set(p.productId, p.stock);
    if (p.price != null) priceByProduct.set(p.productId, p.price);
  }
  const soldByProduct = new Map<string, number>();
  for (const s of sold) {
    if (s.productId) soldByProduct.set(s.productId, s._sum.qty ?? 0);
  }

  // Stok ditampilkan per KODE mold (barang sekode = barang fisik yang sama).
  // Nama "Antigores Clear IPHONE 16 PRO" → type "Antigores Clear" + model
  // "IPHONE 16 PRO"; model jadi daftar tipe HP yang cocok untuk kode itu.
  const splitName = (name: string) => {
    const m = name.match(/^\s*(Antigores\s+\S+)\s+(.+)$/i);
    return m
      ? { type: m[1].trim(), model: m[2].trim() }
      : { type: "", model: name.trim() };
  };
  type StockCodeAgg = {
    code: string;
    type: string;
    models: string[];
    remaining: number;
    price: number;
    isCustomPrice: boolean;
  };
  const codeMap = new Map<string, StockCodeAgg>();
  for (const p of products) {
    const key = p.code ?? `__${p.id}`;
    const { type, model } = splitName(p.name);
    const remaining = Math.max(
      0,
      (stockByProduct.get(p.id) ?? 0) - (soldByProduct.get(p.id) ?? 0),
    );
    const g =
      codeMap.get(key) ??
      ({
        code: p.code ?? "—",
        type: type || p.name,
        models: [],
        remaining: 0,
        price: p.price,
        isCustomPrice: false,
      } satisfies StockCodeAgg);
    g.models.push(model);
    g.remaining += remaining;
    // Harga jual: pakai harga custom owner (dari POS) kalau ada di salah
    // satu produk sekode, kalau belum harga katalog.
    const custom = priceByProduct.get(p.id);
    if (custom != null && !g.isCustomPrice) {
      g.price = custom;
      g.isCustomPrice = true;
    }
    codeMap.set(key, g);
  }
  const stockCodes = [...codeMap.values()].sort((a, b) =>
    a.code.localeCompare(b.code),
  );

  const stocked = stockCodes.filter((c) => c.remaining > 0);
  const totalUnits = stocked.reduce((a, c) => a + c.remaining, 0);
  const low = stocked.filter((c) => c.remaining <= 5).length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Stok Barang</h1>
        <p className="text-sm text-neutral-500">
          Sisa stok per kode barang di tokomu
        </p>
      </div>

      {/* Koreksi stok mandiri dihapus — selisih stok diajukan lewat tiket
          supaya diverifikasi admin/sales dulu */}
      <div className="flex items-start gap-2 rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-600">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-neutral-400" />
        <p>
          Stok tidak sinkron dengan fisik (kurang / lebih)? Ajukan lewat
          halaman{" "}
          <Link
            href="/tiket"
            className="font-semibold text-neutral-900 underline underline-offset-2"
          >
            Tiket Keluhan
          </Link>{" "}
          — pengaduan diproses dalam 1–2 hari kerja.
        </p>
      </div>

      {/* Ringkasan cepat */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Kode Barang</p>
          <p className="text-2xl font-bold">{stocked.length}</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Total Unit</p>
          <p className="text-2xl font-bold">{totalUnits}</p>
        </div>
        <Link
          href="/order"
          className="col-span-2 flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 hover:border-neutral-400 sm:col-span-1"
        >
          <span className="min-w-0">
            <span className="flex items-center gap-1 text-xs text-neutral-500">
              <ShoppingBag className="h-3.5 w-3.5" />
              Stok Menipis
            </span>
            <span className="block text-sm font-semibold">
              {low > 0 ? `${low} barang — order restok` : "Aman — order restok"}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 shrink-0 text-neutral-400" />
        </Link>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5">
        <StockEditor codes={stockCodes} />
      </div>

    </div>
  );
}
