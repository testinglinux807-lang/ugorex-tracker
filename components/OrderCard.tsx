import type { Prisma } from "@prisma/client";
import { waLink } from "@/lib/wa";
import { markOrderPaidCash, updateRequestStatus } from "@/app/actions/requests";
import { SubmitButton } from "@/components/SubmitButton";
import { PayOrderButton } from "@/components/PayOrderButton";
import { DeliveryReportForm } from "@/components/DeliveryReportForm";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { fmtDate } from "@/lib/date";
import {
  MessageCircle,
  MapPin,
  Navigation,
  Package,
  PackageCheck,
  Store,
  Truck,
  ChevronDown,
  Banknote,
} from "lucide-react";

export type OrderRequest = Prisma.RequestGetPayload<{
  include: {
    store: { include: { sales: true } };
    createdBy: true;
    items: { include: { product: true } };
  };
}>;

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  SHIPPED: "Dikirim",
  COMPLETED: "Sampai",
};
// Gradasi monokrom mengikuti progres: abu tipis → outline hitam → hitam
// solid — biar kartu tidak jadi pelangi (gaya app: monokrom + aksen lime).
const STATUS_CLS: Record<string, string> = {
  PENDING: "border-neutral-300 bg-white text-neutral-500",
  SHIPPED: "border-neutral-900 bg-white text-neutral-900",
  COMPLETED: "border-neutral-900 bg-neutral-900 text-white",
};

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

function ItemRow({
  item: it,
  canRespond,
  remaining,
}: {
  item: OrderRequest["items"][number];
  canRespond: boolean;
  remaining: number | undefined;
}) {
  const short = it.product.centralStock < it.qty;
  return (
    <div className="flex items-center gap-3">
      {it.product.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={it.product.imageUrl}
          alt={it.product.name}
          className="h-12 w-12 shrink-0 rounded-lg border border-neutral-200 object-cover"
        />
      ) : (
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
          <Package className="h-5 w-5 text-neutral-300" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{it.product.name}</p>
        <p className="text-xs text-neutral-500">
          {it.qty} × {rupiah(it.price)}
        </p>
        {canRespond && (
          <p
            className={`text-[11px] ${
              short ? "font-semibold text-red-600" : "text-neutral-400"
            }`}
          >
            Stok pusat {it.product.centralStock}
            {short ? " (kurang!)" : ""} · toko {remaining ?? 0}
          </p>
        )}
      </div>
      <span className="shrink-0 text-sm font-semibold">
        {rupiah(it.qty * it.price)}
      </span>
    </div>
  );
}

// Kartu orderan gaya marketplace: header toko + no. order, barang ringkas
// (sisanya dilipat), footer total + aksi.
export function OrderCard({
  order: r,
  canRespond,
  remaining,
  highlighted = false,
}: {
  order: OrderRequest;
  canRespond: boolean;
  remaining: Map<string, number>;
  highlighted?: boolean; // datang dari klik notifikasi — kartu disorot
}) {
  const wa = waLink(
    r.store.ownerPhone,
    `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal orderan #${r.id.slice(-8).toUpperCase()} dari ${r.store.name}.`,
  );
  // Untuk owner: chat ke sales pemegang tokonya soal order ini
  const waSales = waLink(
    r.store.sales?.phone,
    `Halo ${r.store.sales?.name ?? ""}, saya dari ${r.store.name}. Mau tanya soal orderan #${r.id.slice(-8).toUpperCase()}.`,
  );
  const shown = r.items.slice(0, 2);
  const rest = r.items.slice(2);

  // Lokasi toko untuk sales/admin yang mengantar: koordinat (kalau ada)
  // membuka rute Google Maps langsung ke titiknya; tanpa koordinat,
  // fallback cari berdasarkan nama + wilayah.
  const hasCoords = r.store.lat != null && r.store.lng != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${r.store.lat},${r.store.lng}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [r.store.name, r.store.area].filter(Boolean).join(" "),
      )}`;

  return (
    <div
      className={`overflow-hidden rounded-xl border bg-white ${
        highlighted
          ? "border-brand-dark ring-2 ring-brand"
          : "border-neutral-200"
      }`}
    >
      {/* Header: nama toko besar; no. order jadi subjudul kecil supaya
          tidak berebut baris sama badge di layar sempit */}
      <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <Store className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              {canRespond ? r.store.name : "Order"}
            </p>
            <p className="truncate pl-5 font-mono text-[11px] text-neutral-400">
              #{r.id.slice(-8).toUpperCase()}
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                r.paymentStatus === "PAID"
                  ? "border-brand bg-brand text-neutral-900"
                  : "border-neutral-300 text-neutral-500"
              }`}
            >
              {r.paymentStatus === "PAID" ? "Lunas" : "Belum bayar"}
              {r.paymentMethod
                ? ` · ${PAYMENT_METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod}`
                : ""}
            </span>
            <span
              className={`rounded-full border px-2 py-0.5 text-xs font-medium ${
                STATUS_CLS[r.status] ?? STATUS_CLS.PENDING
              }`}
            >
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </div>
        </div>
      </div>

      {/* Barang: 2 pertama tampil, sisanya dilipat */}
      <div className="space-y-2.5 px-4 py-3">
        {/* Lokasi tujuan antar — baris polos (bukan kotak) biar ringkas */}
        {canRespond && (
          <div className="flex items-center justify-between gap-2 text-xs">
            <p className="flex min-w-0 items-center gap-1.5 text-neutral-600">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              <span className="truncate">
                {r.store.address || r.store.area || "Alamat toko belum diisi"}
              </span>
            </p>
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-neutral-700 hover:underline"
            >
              <Navigation className="h-3.5 w-3.5" />
              Rute
            </a>
          </div>
        )}
        {shown.map((it) => (
          <ItemRow
            key={it.id}
            item={it}
            canRespond={canRespond}
            remaining={remaining.get(`${r.storeId}:${it.productId}`)}
          />
        ))}
        {rest.length > 0 && (
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-center gap-1 rounded-lg py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-50 [&::-webkit-details-marker]:hidden">
              Lihat {rest.length} produk lainnya
              <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-2.5 pt-2.5">
              {rest.map((it) => (
                <ItemRow
                  key={it.id}
                  item={it}
                  canRespond={canRespond}
                  remaining={remaining.get(`${r.storeId}:${it.productId}`)}
                />
              ))}
            </div>
          </details>
        )}
        {r.message !== "" && (
          <p className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-500">
            {r.message}
          </p>
        )}

        {/* Status pengiriman berjalan */}
        {r.status === "SHIPPED" && (
          <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-600">
            <Truck className="h-4 w-4 shrink-0" />
            Barang sedang dikirim — mohon ditunggu
          </div>
        )}

        {/* Bukti pengiriman (report sales saat barang sampai) */}
        {r.status === "COMPLETED" && (r.deliveryPhoto || r.deliveredAt) && (
          <div className="flex items-start gap-2.5 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
            {r.deliveryPhoto ? (
              <a href={r.deliveryPhoto} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={r.deliveryPhoto}
                  alt="Bukti barang sampai"
                  className="h-16 w-16 shrink-0 rounded-lg border border-neutral-200 object-cover"
                />
              </a>
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
                <PackageCheck className="h-5 w-5 text-neutral-300" />
              </span>
            )}
            <div className="min-w-0 text-xs">
              <p className="flex items-center gap-1 font-semibold text-neutral-800">
                <PackageCheck className="h-3.5 w-3.5" />
                Barang sampai
              </p>
              {r.deliveryNote && (
                <p className="mt-0.5 text-neutral-600">{r.deliveryNote}</p>
              )}
              <p className="mt-0.5 text-neutral-400">
                {r.deliveredBy ? `Oleh ${r.deliveredBy}` : ""}
                {r.deliveredBy && r.deliveredAt ? " · " : ""}
                {r.deliveredAt
                  ? fmtDate(r.deliveredAt, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })
                  : ""}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Footer: info ringkas + total */}
      <div className="border-t border-neutral-100 px-4 py-2.5">
        <p className="truncate text-xs text-neutral-400">
          {fmtDate(r.createdAt)} · {r.createdBy?.name ?? "—"} ·{" "}
          {r.items.length} produk
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs text-neutral-500">Total Pesanan</span>
          <span className="flex items-baseline gap-2">
            {r.discount > 0 && (
              <span className="text-[11px] text-neutral-400">
                hemat {rupiah(r.discount)}
              </span>
            )}
            <span className="text-base font-bold">{rupiah(r.total)}</span>
          </span>
        </div>
        {r.paymentFee > 0 && (
          <>
            <div className="mt-0.5 flex items-baseline justify-between gap-2 text-xs text-neutral-500">
              <span>Biaya layanan</span>
              <span>{rupiah(r.paymentFee)}</span>
            </div>
            <div className="mt-0.5 flex items-baseline justify-between gap-2">
              <span className="text-xs font-medium text-neutral-600">
                Total Bayar
              </span>
              <span className="text-sm font-bold">
                {rupiah(r.total + r.paymentFee)}
              </span>
            </div>
          </>
        )}
      </div>

      {/* Aksi owner: bayar order yang belum lunas + chat sales pemegang toko */}
      {!canRespond &&
        (waSales ||
          (r.paymentStatus !== "PAID" &&
            r.paymentMethod !== "CASH" &&
            r.status !== "COMPLETED")) && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-2.5">
            {waSales && (
              <a
                href={waSales}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
              >
                <MessageCircle className="h-3.5 w-3.5 text-green-600" />
                Chat Sales{r.store.sales?.name ? ` (${r.store.sales.name})` : ""}
              </a>
            )}
            {r.paymentStatus !== "PAID" &&
              r.paymentMethod !== "CASH" &&
              r.status !== "COMPLETED" && (
                <PayOrderButton
                  orderId={r.id}
                  grandTotal={r.total + r.paymentFee}
                />
              )}
          </div>
        )}

      {/* Aksi */}
      {canRespond && (
        <div className="flex flex-wrap justify-end gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-2.5">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              <MessageCircle className="h-3.5 w-3.5 text-green-600" />
              Hubungi Owner
            </a>
          )}
          {/* Alur: Menunggu → Tandai Dikirim (notif owner) → report sampai */}
          {r.status === "PENDING" && (
            <form action={updateRequestStatus.bind(null, r.id, "SHIPPED")}>
              <SubmitButton
                pendingText="Memproses…"
                overlayText="Menandai order dikirim…"
                className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                <Truck className="h-3.5 w-3.5" />
                Tandai Dikirim
              </SubmitButton>
            </form>
          )}
          {r.status === "SHIPPED" && <DeliveryReportForm orderId={r.id} />}
          {r.paymentMethod === "CASH" &&
            r.paymentStatus !== "PAID" &&
            r.status === "COMPLETED" && (
              <form
                action={async () => {
                  "use server";
                  await markOrderPaidCash(r.id);
                }}
              >
                <SubmitButton
                  pendingText="Memproses…"
                  overlayText="Menandai lunas…"
                  className="inline-flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Tandai Lunas (Cash)
                </SubmitButton>
              </form>
            )}
          {r.status === "COMPLETED" && (
            <form action={updateRequestStatus.bind(null, r.id, "PENDING")}>
              <SubmitButton
                pendingText="Memproses…"
                overlayText="Membuka order lagi…"
                className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
              >
                Buka lagi
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
