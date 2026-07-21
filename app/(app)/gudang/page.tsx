import { redirect } from "next/navigation";
import { MapPinOff, Printer } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import {
  loadGudangLocs,
  getGudangRadiusKm,
  assignForOrder,
} from "@/lib/gudang-assign";
import { printAllOrderResi } from "@/app/actions/requests";
import { SubmitButton } from "@/components/SubmitButton";
import { OrderCard, type OrderRequest } from "@/components/OrderCard";
import { OrderList } from "@/components/OrderList";

// Teks yang bisa dicari dari sebuah paket (resi / toko / barang)
function searchOf(r: OrderRequest) {
  return [r.resiNo, r.store.name, ...r.items.map((it) => it.product.name)]
    .filter(Boolean)
    .join(" ");
}

export default async function GudangHome() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "GUDANG") redirect("/dashboard");

  const [orders, gudangLocs, radius] = await Promise.all([
    prisma.request.findMany({
      where: { status: "PENDING", items: { some: {} } },
      include: {
        store: { include: { sales: true } },
        createdBy: true,
        items: {
          include: {
            product: {
              select: { id: true, name: true, code: true, centralStock: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    loadGudangLocs(),
    getGudangRadiusKm(),
  ]);

  // Antrian packing = paket PENDING yang ditugaskan ke gudang ini (terdekat)
  const mine = orders
    .map((r) => ({ r, a: assignForOrder(r, gudangLocs, radius) }))
    .filter((x) => x.a != null && x.a.gudangId === user.id);

  const hasLoc = gudangLocs.some((g) => g.id === user.id);

  // Sisa stok per (toko, barang) untuk hint packing
  const storeIds = [...new Set(mine.map((x) => x.r.storeId))];
  const [prospects, sold] = await Promise.all([
    storeIds.length
      ? prisma.prospect.findMany({ where: { storeId: { in: storeIds } } })
      : Promise.resolve([]),
    storeIds.length
      ? prisma.sale.groupBy({
          by: ["storeId", "productId"],
          where: { storeId: { in: storeIds } },
          _sum: { qty: true },
        })
      : Promise.resolve([]),
  ]);
  const remaining = new Map<string, number>();
  for (const p of prospects)
    remaining.set(`${p.storeId}:${p.productId}`, p.stock);
  for (const s of sold) {
    if (!s.productId) continue;
    const key = `${s.storeId}:${s.productId}`;
    remaining.set(key, Math.max(0, (remaining.get(key) ?? 0) - (s._sum.qty ?? 0)));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Paket untuk Disiapkan</h1>
          <p className="text-sm text-neutral-500">
            Halo {user.name.split(" ")[0]} — {mine.length} paket ditugaskan ke
            kamu. Siapkan lalu cetak resinya.
          </p>
        </div>
        {mine.length > 0 && (
          <form
            action={async () => {
              "use server";
              await printAllOrderResi();
            }}
          >
            <SubmitButton
              pendingText="Menyiapkan…"
              overlayText="Menyiapkan semua resi…"
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              <Printer className="h-4 w-4" />
              Cetak Semua Resi ({mine.length})
            </SubmitButton>
          </form>
        )}
      </div>

      {!hasLoc && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <MapPinOff className="mt-0.5 h-4 w-4 shrink-0" />
          Lokasi gudangmu belum diatur admin — paket belum bisa ditugaskan
          otomatis ke kamu.
        </div>
      )}

      <OrderList
        showFilters={false}
        emptyAll="Belum ada paket yang ditugaskan ke kamu."
        items={mine.map(({ r, a }) => ({
          status: r.status,
          search: searchOf(r),
          node: (
            <OrderCard
              key={r.id}
              order={r}
              canRespond
              isGudang
              canTrack={false}
              showPrice
              assignedGudangName={a?.gudangName ?? null}
              assignedToMe
              assignedFar={a?.far ?? false}
              assignedDistKm={a?.salesDistKm ?? null}
              remaining={remaining}
            />
          ),
        }))}
      />
    </div>
  );
}
