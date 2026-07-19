import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createProduct, createStore } from "@/app/actions/tracker";
import { CreateSalesForm } from "@/components/AccountForms";
import { Paginated } from "@/components/Paginated";
import { KonterList } from "@/components/KonterList";
import { SalesRow } from "@/components/DataActions";
import { ProductTable } from "@/components/ProductTable";
import { SubmitButton } from "@/components/SubmitButton";
import { DataTabs } from "@/components/DataTabs";
import { VoucherManager } from "@/components/VoucherManager";
import { GrosirManager } from "@/components/GrosirManager";
import { Package, Percent, Store, TicketPercent, Users } from "lucide-react";

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

  const [products, stores, salesList, vouchers, grosirTiers] =
    await Promise.all([
      prisma.product.findMany({ orderBy: { name: "asc" } }),
      prisma.store.findMany({
        where: isAdmin ? {} : { salesId: user.id },
        include: { sales: true, ownerUser: true },
        orderBy: { name: "asc" },
      }),
      prisma.user.findMany({
        where: { role: "SALES" },
        orderBy: { name: "asc" },
      }),
      isAdmin
        ? prisma.voucher.findMany({ orderBy: { createdAt: "desc" } })
        : Promise.resolve([]),
      isAdmin
        ? prisma.grosirTier.findMany({ orderBy: { minQty: "asc" } })
        : Promise.resolve([]),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Data</h1>
        <p className="text-sm text-neutral-500">
          Kelola barang, konter, dan akun sales
        </p>
      </div>

      {/* Di HP tiap bagian jadi tab (DataTabs); di desktop grid seperti biasa */}
      <DataTabs
        tabs={[
          { key: "barang", label: "Barang", count: products.length },
          ...(isAdmin
            ? [
                { key: "voucher", label: "Voucher", count: vouchers.length },
                { key: "sales", label: "Akun Sales", count: salesList.length },
              ]
            : []),
          { key: "konter", label: "Konter", count: stores.length },
        ]}
        sections={[
          {
            tab: "barang",
            className: "lg:col-span-2",
            node: (
      /* Barang — full width: cari + pagination (katalog ratusan item) */
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
            code: p.code,
            price: p.price,
            description: p.description,
            centralStock: p.centralStock,
          }))}
        />
      </section>
            ),
          },
          {
            tab: "barang",
            node: (
        <section className="rounded-xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Package className="h-4 w-4 text-neutral-500" />
            <h2 className="font-semibold">Tambah Barang</h2>
          </div>
          <form action={createProduct} className="space-y-2">
            <input
              name="name"
              required
              placeholder="Nama barang"
              className={inputCls}
            />
            <input
              name="code"
              placeholder="Kode / ID (mis. AA01)"
              className={inputCls}
            />
            <div className="grid grid-cols-2 gap-2">
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
                className={inputCls}
              />
            </div>
            <p className="text-[11px] text-neutral-400">
              Barang dengan kode yang sama berbagi satu stok pusat — kalau
              kodenya sudah dipakai barang lain, stok mengikuti stok kode itu.
            </p>
            <input
              name="description"
              placeholder="Deskripsi (opsional)"
              className={inputCls}
            />
            <SubmitButton
              pendingText="Menyimpan…"
              className={`${btnCls} w-full disabled:opacity-60`}
            >
              Tambah Barang
            </SubmitButton>
          </form>
        </section>
            ),
          },
          ...(isAdmin
            ? [
                {
                  tab: "voucher",
                  node: (
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <TicketPercent className="h-4 w-4 text-neutral-500" />
              <h2 className="font-semibold">Voucher Toko</h2>
              <Count n={vouchers.length} />
            </div>
            <p className="mb-3 text-xs text-neutral-400">
              Kode diskon untuk owner — bisa dipakai saat order restok dan
              catat penjualan di POS.
            </p>
            <VoucherManager
              vouchers={vouchers.map((v) => ({
                id: v.id,
                code: v.code,
                type: v.type,
                value: v.value,
                maxUses: v.maxUses,
                usedCount: v.usedCount,
                expiresAt: v.expiresAt ? v.expiresAt.toISOString() : null,
                active: v.active,
              }))}
            />
          </section>
                  ),
                },
                {
                  tab: "voucher",
                  node: (
          /* Diskon grosir — otomatis dari total qty order, tanpa kode */
          <section className="rounded-xl border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Percent className="h-4 w-4 text-neutral-500" />
              <h2 className="font-semibold">Diskon Grosir</h2>
              <Count n={grosirTiers.length} />
            </div>
            <GrosirManager
              tiers={grosirTiers.map((t) => ({
                id: t.id,
                minQty: t.minQty,
                percent: t.percent,
                active: t.active,
              }))}
            />
          </section>
                  ),
                },
                {
                  tab: "sales",
                  node: (
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
                    user={{
                      id: s.id,
                      name: s.name,
                      phone: s.phone,
                      homeLat: s.homeLat,
                      homeLng: s.homeLng,
                      nik: s.nik,
                    }}
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
                  ),
                },
              ]
            : []),
          {
            tab: "konter",
            className: "lg:col-span-2",
            node: (
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
            ),
          },
        ]}
      />
    </div>
  );
}
