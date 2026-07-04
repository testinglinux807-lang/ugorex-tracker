import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { KatalogGrid } from "@/components/KatalogGrid";
import { productImageSrc } from "@/lib/product-image";
import { ArrowRight } from "lucide-react";

export default async function KatalogPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  const [products, stores] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.store.findMany({
      where: user.role === "SALES" ? { salesId: user.id } : {},
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Katalog</h1>
        <p className="text-sm text-neutral-500">
          Pilih barang untuk ditawarkan ke konter
        </p>
      </div>

      {products.length === 0 ? (
        <div className="rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-sm text-neutral-700">
          <p>Belum ada barang.</p>
          <Link
            href="/data"
            className="inline-flex items-center gap-1 font-semibold underline"
          >
            Tambah dulu di menu Data
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <KatalogGrid
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            imageUrl: productImageSrc(p),
            central: p.centralStock,
          }))}
          stores={stores.map((s) => ({
            id: s.id,
            name: s.name,
            area: s.area,
          }))}
        />
      )}
    </div>
  );
}
