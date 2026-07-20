import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { fmtDateTime } from "@/lib/date";
import {
  OrderTimeline,
  TIMELINE_ICONS,
  type TimelineEvent,
} from "@/components/OrderTimeline";
import { ArrowLeft, Store } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Disiapkan Gudang",
  READY: "Siap Dipickup",
  SHIPPED: "Dikirim",
  COMPLETED: "Sampai",
  CANCELLED: "Dibatalkan",
  RETURNED: "Diretur",
};

// Halaman lacak paket — semua role bisa lihat (di-scope: admin semua,
// sales toko yang dipegang, owner tokonya sendiri).
export default async function LacakPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const r = await prisma.request.findUnique({
    where: { id },
    include: {
      store: { include: { sales: true } },
      createdBy: true,
      items: { include: { product: { select: { name: true } } } },
    },
  });
  if (!r || r.items.length === 0) notFound();

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && r.store.salesId === user.id) ||
    (user.role === "OWNER" && user.ownedStore?.id === r.storeId);
  if (!allowed) notFound();

  const I = TIMELINE_ICONS;
  const noLabel = r.resiNo ?? `#${r.id.slice(-8).toUpperCase()}`;
  const totalQty = r.items.reduce((a, it) => a + it.qty, 0);

  // Susun event dari timestamp yang ada, lalu urutkan terbaru dulu.
  const events: TimelineEvent[] = [];
  events.push({
    icon: I.ShoppingBag,
    title: "Pesanan dibuat",
    sub: `${r.items.length} SKU · ${totalQty} pcs${r.createdBy?.name ? ` · oleh ${r.createdBy.name}` : ""}`,
    at: r.createdAt,
  });
  if (r.paymentStatus === "PAID") {
    events.push({
      icon: I.Banknote,
      title: "Pembayaran lunas",
      sub: r.paymentMethod
        ? (PAYMENT_METHOD_LABEL[r.paymentMethod] ?? r.paymentMethod)
        : null,
      at: null, // paidAt belum disimpan — waktu tak ditampilkan presisi
    });
  }
  if (r.readyAt) {
    events.push({
      icon: I.PackageCheck,
      title: "Barang siap dipickup di gudang",
      sub: [r.readyBy, r.pickupCode ? `kode jemput ${r.pickupCode}` : null]
        .filter(Boolean)
        .join(" · "),
      at: r.readyAt,
    });
  }
  if (r.pickedUpAt) {
    events.push({
      icon: I.Truck,
      title: "Kurir mengambil barang — dalam pengiriman",
      sub: r.pickedUpBy,
      at: r.pickedUpAt,
    });
  }
  if (r.returnedAt) {
    events.push({
      icon: I.PackageX,
      title:
        r.status === "RETURNED"
          ? "Pesanan dikembalikan (semua)"
          : "Sebagian barang dikembalikan",
      sub: [r.returnReason, `nilai retur ${rupiah(r.returnedTotal)}`]
        .filter(Boolean)
        .join(" · "),
      at: r.returnedAt,
      tone: "danger",
    });
  }
  if (r.deliveredAt && r.status !== "RETURNED") {
    events.push({
      icon: I.PackageCheck,
      title: "Pesanan tiba & diterima toko",
      sub: [r.deliveredBy, r.deliveryNote].filter(Boolean).join(" · "),
      at: r.deliveredAt,
    });
  }
  if (r.cancelledAt) {
    events.push({
      icon: I.XCircle,
      title: "Pesanan dibatalkan",
      sub: [r.cancelledBy, r.cancelReason].filter(Boolean).join(" · "),
      at: r.cancelledAt,
      tone: "danger",
    });
  }
  if (r.refundedAt) {
    events.push({
      icon: I.BadgeCheck,
      title: "Dana dikembalikan",
      sub: [r.refundedBy, r.refundNote].filter(Boolean).join(" · "),
      at: r.refundedAt,
    });
  }
  events.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0));

  return (
    <div className="space-y-4">
      <Link
        href="/order"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 hover:text-neutral-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke Order
      </Link>

      {/* Desktop: ringkasan (sticky) di kiri, timeline di kanan — full width,
          tidak menyempit di tengah. Mobile: bertumpuk. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {/* Ringkasan order */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm lg:sticky lg:top-20 lg:self-start">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-semibold">
                <Store className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                {r.store.name}
              </p>
              <p className="pl-5 font-mono text-[11px] text-neutral-400">
                {noLabel}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-xs font-medium text-white">
              {STATUS_LABEL[r.status] ?? r.status}
            </span>
          </div>
          <p className="mt-1 pl-5 text-[11px] text-neutral-400">
            {fmtDateTime(r.createdAt)}
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm">
            <span className="text-neutral-500">
              {r.items.length} SKU · {totalQty} pcs
            </span>
            <span className="font-bold">{rupiah(r.total)}</span>
          </div>
          <Link
            href={`/order?focus=${r.id}`}
            className="mt-3 block w-full rounded-lg border border-neutral-300 py-1.5 text-center text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            Rincian Pesanan
          </Link>
        </div>

        {/* Timeline lacak */}
        <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm lg:col-span-2">
          <h2 className="mb-4 font-semibold">Lacak Paket</h2>
          <OrderTimeline events={events} />
        </div>
      </div>
    </div>
  );
}
