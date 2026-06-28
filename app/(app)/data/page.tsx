import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createProduct, createStore } from "@/app/actions/tracker";
import { CreateSalesForm } from "@/components/AccountForms";
import { Paginated } from "@/components/Paginated";
import { KonterList } from "@/components/KonterList";
import { Package, Store, Users } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const btnCls =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

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

      {/* Barang + Sales sejajar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Barang */}
        <section className="flex flex-col rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-neutral-500" />
            <h2 className="font-semibold">Barang</h2>
            <Count n={products.length} />
          </div>
          <div className="flex-1">
            <Paginated
              perPage={5}
              className="divide-y divide-neutral-100"
              empty={
                <p className="text-sm text-neutral-400">Belum ada barang.</p>
              }
              items={products.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-2 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    {p.description && (
                      <p className="truncate text-xs text-neutral-400">
                        {p.description}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 font-semibold">
                    {rupiah(p.price)}
                  </span>
                </div>
              ))}
            />
          </div>

          <div className="mt-4 border-t border-neutral-100 pt-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
              Tambah Barang
            </p>
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
              </div>
              <input
                name="description"
                placeholder="Deskripsi (opsional)"
                className={inputCls}
              />
              <button className={`${btnCls} w-full`}>Tambah Barang</button>
            </form>
          </div>
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
                  <div
                    key={s.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="font-medium">{s.name}</span>
                    <span className="text-neutral-400">{s.phone}</span>
                  </div>
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
            salesName: s.sales?.name ?? null,
            ownerName: s.ownerName,
            ownerPhone: s.ownerPhone,
            hasOwner: !!s.ownerUser,
          }))}
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
            <button className={`${btnCls} sm:col-span-2`}>Tambah Konter</button>
          </form>
        </div>
      </section>
    </div>
  );
}
