import type { Prisma } from "@prisma/client";
import { waLink } from "@/lib/wa";
import {
  acceptOrder,
  markOrderPaidCash,
  markOrderReady,
  pickupOrder,
  printOrderResi,
  updateRequestStatus,
} from "@/app/actions/requests";
import { SubmitButton } from "@/components/SubmitButton";
import { PayOrderButton } from "@/components/PayOrderButton";
import { CancelOrderForm } from "@/components/CancelOrderForm";
import { RefundOrderForm } from "@/components/RefundOrderForm";
import { DeliveryReportForm } from "@/components/DeliveryReportForm";
import { ReturnOrderForm } from "@/components/ReturnOrderForm";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { fmtDate, fmtDateTime } from "@/lib/date";
import {
  MessageCircle,
  MapPin,
  Navigation,
  Package,
  PackageCheck,
  PackageX,
  Store,
  Truck,
  ChevronDown,
  Banknote,
  Printer,
  XCircle,
  BadgeCheck,
} from "lucide-react";

export type OrderRequest = Prisma.RequestGetPayload<{
  include: {
    store: { include: { sales: true } };
    createdBy: true;
    items: {
      include: {
        product: { select: { id: true; name: true; centralStock: true } };
      };
    };
  };
}>;

// Alur: PENDING (disiapkan gudang) → READY (siap dipickup) → SHIPPED
// (kurir mengantar) → COMPLETED / RETURNED (toko tolak semua)
const STATUS_LABEL: Record<string, string> = {
  PENDING: "Disiapkan Gudang",
  READY: "Siap Dipickup",
  SHIPPED: "Dikirim",
  COMPLETED: "Sampai",
  CANCELLED: "Dibatalkan",
  RETURNED: "Diretur",
};
// Gradasi monokrom mengikuti progres: abu tipis → outline hitam → hitam
// solid — biar kartu tidak jadi pelangi (gaya app: monokrom + aksen lime).
// Merah khusus status batal/retur (konsisten: merah utk negatif).
const STATUS_CLS: Record<string, string> = {
  PENDING: "border-neutral-300 bg-white text-neutral-500",
  READY: "border-neutral-500 bg-white text-neutral-700",
  SHIPPED: "border-neutral-900 bg-white text-neutral-900",
  COMPLETED: "border-neutral-900 bg-neutral-900 text-white",
  CANCELLED: "border-red-200 bg-red-50 text-red-600",
  RETURNED: "border-red-300 bg-white text-red-600",
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
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-medium leading-snug">
          {it.product.name}
        </p>
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
  isAdmin = false,
  remaining,
  highlighted = false,
  orderSeq,
}: {
  order: OrderRequest;
  canRespond: boolean;
  // ADMIN (gudang): tombol "Siap Dipickup" + tandai refund dana
  isAdmin?: boolean;
  remaining: Map<string, number>;
  highlighted?: boolean; // datang dari klik notifikasi — kartu disorot
  orderSeq?: number; // orderan ke-berapa dari toko ini (dihitung di page)
}) {
  // Identitas order di teks: nomor resi kalau sudah terbit, id kalau belum
  const noLabel = r.resiNo ?? `#${r.id.slice(-8).toUpperCase()}`;
  const wa = waLink(
    r.store.ownerPhone,
    `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal orderan ${noLabel} dari ${r.store.name}.`,
  );
  // Untuk owner: chat ke sales pemegang tokonya soal order ini
  const waSales = waLink(
    r.store.sales?.phone,
    `Halo ${r.store.sales?.name ?? ""}, saya dari ${r.store.name}. Mau tanya soal orderan ${noLabel}.`,
  );
  const shown = r.items.slice(0, 2);
  const rest = r.items.slice(2);

  const cancelled = r.status === "CANCELLED";
  const returned = r.status === "RETURNED"; // toko tolak SEMUA barang
  // Ada retur (semua atau sebagian) — tampilkan kotak info retur
  const hasReturn = returned || r.returnedTotal > 0;
  // Owner: bayar hanya order online bertagihan (> 0) yang belum lunas &
  // masih hidup — total 0 tidak bisa ditagih Midtrans, dilunasi manual
  const ownerCanPay =
    r.paymentStatus !== "PAID" &&
    r.paymentMethod !== "CASH" &&
    r.total + r.paymentFee > 0 &&
    r.status !== "COMPLETED" &&
    !cancelled &&
    !returned;
  // Owner boleh membatalkan sendiri hanya sebelum dibayar & sebelum diproses
  const ownerCanCancel = r.status === "PENDING" && r.paymentStatus !== "PAID";
  // Kurir sedang mengantar → owner konfirmasi terima / ajukan pengembalian
  const ownerCanReceive = r.status === "SHIPPED";

  // Catatan owner: saat checkout tanpa catatan, message otomatis berisi
  // ringkasan item — jangan ditampilkan dobel dengan daftar barang.
  const autoSummary = r.items
    .map((it) => `${it.product.name} ×${it.qty}`)
    .join(", ");
  const note = r.message.trim() === autoSummary ? "" : r.message;

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
      {/* Header: nama toko besar; subjudul = no. resi/order + tanggal,
          hari & jam dibuatnya order. Badge bayar & status SEBARIS: di HP
          turun jadi baris sendiri di bawah judul (nama toko sempit),
          di desktop nempel kanan sejajar judul. */}
      <div className="border-b border-neutral-100 bg-neutral-50 px-4 py-2.5">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate text-sm font-semibold">
              <Store className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
              {canRespond ? r.store.name : "Order"}
            </p>
            <p className="truncate pl-5 text-[11px] text-neutral-400">
              {/* Sudah ada resi → tampilkan resi saja, id internal tak perlu */}
              <span className="font-mono">
                {r.resiNo ? `Resi ${r.resiNo}` : `#${r.id.slice(-8).toUpperCase()}`}
              </span>
              {" · "}
              {/* HP: tanggal ringkas biar muat; desktop: lengkap + hari */}
              <span className="sm:hidden">
                {fmtDateTime(r.createdAt, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              <span className="hidden sm:inline">
                {fmtDateTime(r.createdAt)}
              </span>
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-1 pl-5 sm:justify-end sm:pl-0">
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

      {/* Body — urutan dibuat gampang dibaca: (1) kondisi order sekarang,
          (2) info pengiriman, (3) daftar barang, (4) catatan owner */}
      <div className="space-y-2.5 px-4 py-3">
        {/* Status alur berjalan: disiapkan gudang → siap dipickup → dikirim */}
        {r.status === "PENDING" && (
          <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-600">
            <Package className="h-4 w-4 shrink-0" />
            Pesanan sedang disiapkan gudang
          </div>
        )}
        {r.status === "READY" && (
          <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-600">
            <PackageCheck className="h-4 w-4 shrink-0" />
            <span>
              Barang siap — menunggu kurir pickup di gudang
              {r.readyBy && (
                <span className="block font-normal text-neutral-400">
                  Disiapkan {r.readyBy}
                  {r.readyAt
                    ? ` · ${fmtDate(r.readyAt, { day: "numeric", month: "short" })}`
                    : ""}
                </span>
              )}
            </span>
          </div>
        )}
        {r.status === "SHIPPED" && (
          <div className="flex items-center gap-2 rounded-lg bg-neutral-50 px-2.5 py-2 text-xs font-medium text-neutral-600">
            <Truck className="h-4 w-4 shrink-0" />
            <span>
              Kurir sedang mengirim ke lokasi tujuan
              {r.pickedUpBy && (
                <span className="block font-normal text-neutral-400">
                  Dibawa {r.pickedUpBy}
                  {r.pickedUpAt
                    ? ` · ${fmtDate(r.pickedUpAt, { day: "numeric", month: "short" })}`
                    : ""}
                </span>
              )}
            </span>
          </div>
        )}

        {/* Pengembalian pesanan oleh toko (semua / sebagian) */}
        {hasReturn && (
          <div className="space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs">
            <p className="flex items-center gap-1 font-semibold text-red-700">
              <PackageX className="h-3.5 w-3.5" />
              {returned
                ? "Pesanan dikembalikan semua"
                : "Sebagian barang dikembalikan"}
            </p>
            {r.returnReason && (
              <p className="text-red-600">Alasan: {r.returnReason}</p>
            )}
            {r.items.some((it) => it.returnedQty > 0) && (
              <p className="text-red-600">
                {r.items
                  .filter((it) => it.returnedQty > 0)
                  .map((it) => `${it.product.name} ×${it.returnedQty}`)
                  .join(", ")}
              </p>
            )}
            <p className="text-red-600">
              Nilai retur:{" "}
              <span className="font-semibold">{rupiah(r.returnedTotal)}</span>
              {" — barang kembali ke stok pusat"}
            </p>
            <p className="text-red-400">
              {r.returnedBy ?? "—"}
              {r.returnedAt
                ? ` · ${fmtDate(r.returnedAt, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
            </p>
            {r.paymentStatus === "PAID" &&
              (r.refundedAt ? (
                <div className="pt-0.5">
                  <p className="flex items-center gap-1 font-semibold text-neutral-800">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Dana retur sudah dikembalikan
                  </p>
                  {r.refundNote && (
                    <p className="text-neutral-600">{r.refundNote}</p>
                  )}
                  <p className="text-neutral-400">
                    {r.refundedBy ?? "—"} ·{" "}
                    {fmtDate(r.refundedAt, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ) : (
                <p className="font-medium text-red-600">
                  Order sudah terlanjur dibayar — menunggu pengembalian dana
                  retur dari admin.
                </p>
              ))}
          </div>
        )}

        {/* Order dibatalkan: siapa, kapan, kenapa + peringatan refund */}
        {cancelled && (
          <div className="space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs">
            <p className="flex items-center gap-1 font-semibold text-red-700">
              <XCircle className="h-3.5 w-3.5" />
              Order dibatalkan
            </p>
            {r.cancelReason && (
              <p className="text-red-600">Alasan: {r.cancelReason}</p>
            )}
            <p className="text-red-400">
              {r.cancelledBy ?? "—"}
              {r.cancelledAt
                ? ` · ${fmtDate(r.cancelledAt, {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}`
                : ""}
            </p>
            {r.paymentStatus === "PAID" &&
              (r.refundedAt ? (
                <div className="pt-0.5">
                  <p className="flex items-center gap-1 font-semibold text-neutral-800">
                    <BadgeCheck className="h-3.5 w-3.5" />
                    Dana sudah dikembalikan
                  </p>
                  {r.refundNote && (
                    <p className="text-neutral-600">{r.refundNote}</p>
                  )}
                  <p className="text-neutral-400">
                    {r.refundedBy ?? "—"} ·{" "}
                    {fmtDate(r.refundedAt, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </div>
              ) : (
                <p className="font-medium text-red-600">
                  Order sudah terlanjur dibayar — menunggu pengembalian dana
                  dari admin.
                </p>
              ))}
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

        {/* Info pengiriman (admin/sales): alamat tujuan + resi & kode
            jemput digabung satu kotak biar tidak berserakan */}
        {canRespond && (
          <div className="rounded-lg border border-dashed border-neutral-300 px-2.5 py-2 text-xs">
            <div className="flex items-center justify-between gap-2">
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
            {/* Kode penjemputan ditunjukkan sales saat ambil barang di
                gudang (nomor resinya sendiri sudah tampil di header) */}
            {r.resiNo && (
              <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-dashed border-neutral-200 pt-1.5">
                <span className="text-neutral-500">Kode jemput gudang</span>
                <span className="shrink-0 font-semibold">
                  {r.pickupCode ?? "—"}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Daftar barang: 2 pertama tampil, sisanya dilipat */}
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
        {note !== "" && (
          <p className="rounded-lg bg-neutral-50 px-2.5 py-1.5 text-xs text-neutral-500">
            Catatan: {note}
          </p>
        )}
      </div>

      {/* Footer: orderan ke-berapa dari toko ini + jumlah SKU/pcs + total.
          (Tanggal sudah pindah ke header.) */}
      <div className="border-t border-neutral-100 px-4 py-2.5">
        {/* Boleh wrap di HP — jangan truncate, info "oleh siapa" kepotong */}
        <p className="text-xs text-neutral-400">
          {orderSeq ? `Order ke-${orderSeq} dari toko ini · ` : ""}
          {r.items.length} SKU ·{" "}
          {r.items.reduce((a, it) => a + it.qty, 0)} pcs
          {r.createdBy?.name ? ` · oleh ${r.createdBy.name}` : ""}
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-2">
          <span className="text-xs text-neutral-500">Total Pesanan</span>
          <span className="flex items-baseline gap-2">
            {r.discount + r.grosirDiscount > 0 && (
              <span className="text-[11px] text-neutral-400">
                hemat {rupiah(r.discount + r.grosirDiscount)}
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

      {/* Aksi owner: terima/kembalikan pesanan saat kurir datang, bayar
          order belum lunas, chat sales, batalkan order belum diproses */}
      {!canRespond &&
        (waSales || ownerCanPay || ownerCanCancel || ownerCanReceive) && (
        <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 sm:grid-cols-4">
          {/* Serah terima: konfirmasi terima (stok masuk toko) ATAU tolak
              semua/sebagian barang (alur retur) */}
          {ownerCanReceive && (
            <form
              action={async () => {
                "use server";
                await acceptOrder(r.id);
              }}
            >
              <SubmitButton
                pendingText="Memproses…"
                overlayText="Menerima pesanan…"
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                Terima Pesanan
              </SubmitButton>
            </form>
          )}
          {ownerCanReceive && (
            <ReturnOrderForm
              requestId={r.id}
              items={r.items.map((it) => ({
                id: it.id,
                name: it.product.name,
                qty: it.qty,
              }))}
            />
          )}
          {waSales && (
            <a
              href={waSales}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              <MessageCircle className="h-3.5 w-3.5 text-green-600" />
              Chat Sales{r.store.sales?.name ? ` (${r.store.sales.name})` : ""}
            </a>
          )}
          {ownerCanPay && (
            <div className="[&_button]:w-full [&_button]:justify-center">
              <PayOrderButton
                orderId={r.id}
                grandTotal={r.total + r.paymentFee}
              />
            </div>
          )}
          {ownerCanCancel && <CancelOrderForm requestId={r.id} />}
        </div>
      )}

      {/* Aksi — grid 2 kolom di HP, 4 kolom di desktop biar tombol tidak
          melar selebar kartu */}
      {canRespond && (
        <div className="grid grid-cols-2 gap-2 border-t border-neutral-100 bg-neutral-50 px-4 py-2.5 sm:grid-cols-4">
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
            >
              <MessageCircle className="h-3.5 w-3.5 text-green-600" />
              Hubungi Owner
            </a>
          )}
          {/* Cetak label resi (dibuat sekali di klik pertama) — halaman
              /order/[id]/resi berisi label siap print. Khusus ADMIN/gudang
              (resi dicetak & ditempel saat packing, bukan urusan sales). */}
          {isAdmin && !cancelled && !returned && (
            <form
              action={async () => {
                "use server";
                await printOrderResi(r.id);
              }}
            >
              <SubmitButton
                pendingText="Menyiapkan…"
                overlayText="Menyiapkan resi…"
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
              >
                <Printer className="h-3.5 w-3.5" />
                Cetak Resi
              </SubmitButton>
            </form>
          )}
          {/* Alur: Disiapkan gudang → [admin] Siap Dipickup → [sales]
              Pickup Barang → report sampai / diterima owner */}
          {r.status === "PENDING" && isAdmin && (
            <form
              action={async () => {
                "use server";
                await markOrderReady(r.id);
              }}
            >
              <SubmitButton
                pendingText="Memproses…"
                overlayText="Menandai siap dipickup…"
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                <PackageCheck className="h-3.5 w-3.5" />
                Siap Dipickup
              </SubmitButton>
            </form>
          )}
          {r.status === "READY" && (
            <form
              action={async () => {
                "use server";
                await pickupOrder(r.id);
              }}
            >
              <SubmitButton
                pendingText="Memproses…"
                overlayText="Menandai barang dipickup…"
                className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                <Truck className="h-3.5 w-3.5" />
                Pickup Barang
              </SubmitButton>
            </form>
          )}
          {/* Tombol tertutup dibikin selebar sel grid; form terbuka (ada
              <form> di dalam) melebar 2 kolom */}
          {r.status === "SHIPPED" && (
            <div className="has-[form]:col-span-full [&>button]:w-full [&>button]:justify-center">
              <DeliveryReportForm orderId={r.id} />
            </div>
          )}
          {(r.paymentMethod === "CASH" || r.total + r.paymentFee === 0) &&
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
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Tandai Lunas (Cash)
                </SubmitButton>
              </form>
            )}
          {/* Buka lagi (ADMIN only) hanya untuk order selesai TANPA retur —
              retur sudah menggeser stok, membukanya lagi bikin hitungan kacau */}
          {isAdmin && r.status === "COMPLETED" && r.returnedTotal === 0 && (
            <form action={updateRequestStatus.bind(null, r.id, "PENDING")}>
              <SubmitButton
                pendingText="Memproses…"
                overlayText="Membuka order lagi…"
                className="w-full rounded-lg border border-neutral-300 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
              >
                Buka lagi
              </SubmitButton>
            </form>
          )}
          {/* Batalkan (ADMIN only — sales tidak berwenang membatalkan) —
              order yang belum selesai; kalau sudah lunas, form-nya
              mengingatkan refund manual */}
          {isAdmin &&
            (r.status === "PENDING" ||
              r.status === "READY" ||
              r.status === "SHIPPED") && (
              <CancelOrderForm
                requestId={r.id}
                warnPaid={r.paymentStatus === "PAID"}
              />
            )}
          {/* Order batal/retur yang terlanjur dibayar: admin tandai dananya
              sudah dikembalikan (refund uang manual di luar app) */}
          {isAdmin &&
            (cancelled || hasReturn) &&
            r.paymentStatus === "PAID" &&
            !r.refundedAt && (
              <RefundOrderForm
                requestId={r.id}
                // Batal: seluruh tagihan. Retur semua: nilai retur + fee.
                // Retur sebagian: hanya nilai barang yang diretur.
                amount={
                  cancelled
                    ? r.total + r.paymentFee
                    : r.returnedTotal + (returned ? r.paymentFee : 0)
                }
              />
            )}
        </div>
      )}
    </div>
  );
}
