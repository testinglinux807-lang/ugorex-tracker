import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createProduct, createStore } from "@/app/actions/tracker";
import { CreateSalesForm } from "@/components/AccountForms";
import { Paginated } from "@/components/Paginated";
import { KonterList } from "@/components/KonterList";
import { ProductImageInput } from "@/components/ProductPhoto";
import { SalesRow } from "@/components/DataActions";
import { ProductTable } from "@/components/ProductTable";
import { SubmitButton } from "@/components/SubmitButton";
import { Package, Store, Users } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const btnCls =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800";

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
      {n}
    </span>
  );
}

export default async function DataPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/konter");

  const isAdmin = user.role === "ADMIN";

  const [products, stores, salesList] = await Promise.all([
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.store.findMany({
      where: isAdmin ? {} : { salesId: user.id },
      include: { sales: true, ownerUser: true },
      orderBy: { name: "asc" },
    }),
    prisma.user.findMany({ where: { role: "SALES" }, orderBy: { name: "asc" } }),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data</h1>
        <p className="text-sm text-neutral-500">
          Kelola barang, konter, dan akun sales
        </p>
      </div>

      {/* Barang — full width: cari + pagination (katalog ratusan item) */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Package className="h-4 w-4 text-neutral-500" />
          <h2 className="font-semibold">Barang</h2>
          <Count n={products.length} />
        </div>
        <ProductTable
          products={products.map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            description: p.description,
            imageUrl: p.imageUrl,
            centralStock: p.centralStock,
          }))}
        />
      </section>

      {/* Tambah Barang + Akun Sales sejajar */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-neutral-500" />
            <h2 className="font-semibold">Tambah Barang</h2>
          </div>
          <form action={createProduct} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input name="name" required placeholder="Nama barang" className={inputCls} />
              <input
                name="price"
                type="number"
                min={0}
                placeholder="Harga (Rp)"
                className={inputCls}
              />
              <input
                name="centralStock"
                type="number"
                min={0}
                placeholder="Stok pusat"
                className={`${inputCls} col-span-2`}
              />
            </div>
            <input
              name="description"
              placeholder="Deskripsi (opsional)"
              className={inputCls}
            />
            <ProductImageInput />
            <SubmitButton
              pendingText="Menyimpan…"
              className={`${btnCls} w-full disabled:opacity-60`}
            >
              Tambah Barang
            </SubmitButton>
          </form>
        </section>

        {/* Sales (admin) */}
        {isAdmin && (
          <section className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4 text-neutral-500" />
              <h2 className="font-semibold">Akun Sales</h2>
              <Count n={salesList.length} />
            </div>
            <div className="flex-1">
              <Paginated
                perPage={5}
                className="divide-y divide-neutral-100"
                empty={
                  <p className="text-sm text-neutral-400">Belum ada sales.</p>
                }
                items={salesList.map((s) => (
                  <SalesRow
                    key={s.id}
                    user={{ id: s.id, name: s.name, phone: s.phone }}
                  />
                ))}
              />
            </div>
            <div className="mt-4 border-t border-neutral-100 pt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
                Tambah Sales
              </p>
              <CreateSalesForm />
            </div>
          </section>
        )}
      </div>

      {/* Konter — full width */}
      <section className="rounded-xl border border-neutral-200 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Store className="h-4 w-4 text-neutral-500" />
          <h2 className="font-semibold">Konter / Toko</h2>
          <Count n={stores.length} />
        </div>

        <KonterList
          stores={stores.map((s) => ({
            id: s.id,
            name: s.name,
            area: s.area,
            address: s.address,
            lat: s.lat,
            lng: s.lng,
            salesId: s.salesId,
            salesName: s.sales?.name ?? null,
            ownerName: s.ownerName,
            ownerPhone: s.ownerPhone,
            hasOwner: !!s.ownerUser,
          }))}
          salesOptions={salesList.map((sl) => ({ id: sl.id, name: sl.name }))}
        />

        <div className="mt-4 border-t border-neutral-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
            Tambah Konter
          </p>
          <form action={createStore} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <input name="name" required placeholder="Nama konter" className={inputCls} />
            <input name="area" placeholder="Kecamatan / wilayah" className={inputCls} />
            <input name="ownerName" placeholder="Nama owner" className={inputCls} />
            <input name="ownerPhone" placeholder="No HP owner" className={inputCls} />
            <input name="address" placeholder="Alamat" className={`${inputCls} sm:col-span-2`} />
            <input name="lat" placeholder="Latitude (mis. -6.3227)" className={inputCls} />
            <input name="lng" placeholder="Longitude (mis. 107.3376)" className={inputCls} />
            {isAdmin && (
              <select name="salesId" className={`${inputCls} sm:col-span-2`} defaultValue="">
                <option value="">— Sales penanggung jawab —</option>
                {salesList.map((sl) => (
                  <option key={sl.id} value={sl.id}>
                    {sl.name}
                  </option>
                ))}
              </select>
            )}
            <SubmitButton
              pendingText="Menyimpan…"
              className={`${btnCls} sm:col-span-2 disabled:opacity-60`}
            >
              Tambah Konter
            </SubmitButton>
          </form>
        </div>
      </section>
    </div>
  );
}
