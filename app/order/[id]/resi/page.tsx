import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { fmtDate } from "@/lib/date";
import { PrintResiButton } from "@/components/PrintResiButton";
import { AutoPrintResi } from "@/components/AutoPrintResi";
import { ResiFitScale } from "@/components/ResiFitScale";
import { ArrowLeft } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Barcode dekoratif (bukan simbologi standar yang bisa discan) — pola bar
// deterministik dari teks resi, identitas sebenarnya nomor resi tercetak.
function Barcode({ value, className }: { value: string; className?: string }) {
  let seed = 0;
  for (const ch of value) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const next = () => {
    seed = (seed * 1103515245 + 12345) >>> 0;
    return seed / 2 ** 32;
  };
  const widths: number[] = [];
  for (let i = 0; i < 56; i++) widths.push(1 + Math.floor(next() * 3));
  const total = widths.reduce((a, b) => a + b, 0);
  let x = 0;
  return (
    <svg
      viewBox={`0 0 ${total} 40`}
      preserveAspectRatio="none"
      className={className}
      aria-hidden
    >
      {widths.map((w, i) => {
        const rect =
          i % 2 === 0 ? (
            <rect key={i} x={x} y={0} width={w} height={40} fill="#000" />
          ) : null;
        x += w;
        return rect;
      })}
    </svg>
  );
}

// Label resi cetak (ala label marketplace) — di luar grup (app) supaya
// tercetak polos tanpa navbar. Dibuka lewat aksi Cetak Resi di /order.
export default async function ResiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { auto } = await searchParams;
  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      store: { include: { sales: true } },
      items: {
        include: { product: { select: { name: true, code: true } } },
      },
    },
  });
  if (!req || req.items.length === 0) notFound();

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) notFound();

  // Resi dibuat lewat aksi Cetak Resi — halaman ini tidak bikin sendiri
  if (!req.resiNo) redirect("/order");

  const isCod = req.paymentMethod === "CASH";
  const totalQty = req.items.reduce((a, i) => a + i.qty, 0);
  const subtotal = req.items.reduce((a, i) => a + i.qty * i.price, 0);
  const totalDiskon = req.discount + req.grosirDiscount;
  const grandTotal = req.total + req.paymentFee;
  const shortId = req.id.slice(-8).toUpperCase();

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      {/* Datang dari tombol Cetak Resi → dialog print langsung terbuka,
          selesai/batal balik ke /order */}
      {auto === "1" && <AutoPrintResi />}
      {/* Auto-fit: label yang kepanjangan (item banyak) dikecilkan saat
          print supaya selalu muat 1 halaman label */}
      <ResiFitScale />
      {/* Kertas label termal 100×150 mm (lebar × panjang) — ukuran halaman
          dikunci @page, jadi tombol Cetak → "Save as PDF" langsung
          menghasilkan PDF seukuran label untuk printer bluetooth, tanpa
          atur kertas manual. Lebar label 90mm = jeda 5mm kiri-kanan.
          position static meng-override aturan absolute #struk-print di
          globals.css (punya struk POS); print-color-adjust supaya badge
          hitam (LUNAS) tetap tercetak tanpa opsi Background graphics. */}
      <style>{`
        @media print {
          @page { size: 100mm 150mm; margin: 0; }
          #struk-print {
            position: static !important;
            /* --resi-w & --resi-zoom di-set ResiFitScale: label yang
               kepanjangan dikecilkan (zoom < 1) + layout dilebarkan 90mm/z
               supaya lebar tercetak tetap 90mm — hasilnya selalu 1 halaman */
            width: var(--resi-w, 90mm) !important;
            max-width: none !important;
            zoom: var(--resi-zoom, 1);
            margin: 4mm auto 0 !important;
            padding: 0 !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>
      {/* Toolbar — hilang saat print */}
      <div className="mx-auto mb-4 flex w-full max-w-md items-center justify-between px-4 print:hidden">
        <Link
          href="/order"
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Link>
        <PrintResiButton />
      </div>

      {/* ===== Label ===== */}
      {/* id struk-print: globals.css menyembunyikan semua elemen lain saat
          print (aturan yang sama dengan struk POS) — tanpa id ini hasil
          cetak blank putih */}
      <div
        id="struk-print"
        className="mx-auto w-full max-w-md border-2 border-neutral-900 bg-white text-neutral-900"
      >
        {/* Header: brand | jenis bayar | layanan */}
        <div className="flex items-stretch divide-x-2 divide-neutral-900 border-b-2 border-neutral-900">
          <div className="flex flex-1 items-center gap-2 px-3 py-2">
            <span className="relative h-7 w-7 shrink-0 overflow-hidden rounded">
              <Image
                src="/logo.webp"
                alt="Logo Ugorex"
                fill
                sizes="28px"
                className="object-cover object-top"
              />
            </span>
            <span className="text-lg font-black tracking-tight">UGOREX</span>
          </div>
          <div className="flex flex-1 items-center justify-center px-3 py-2">
            <span className="text-2xl font-black">
              {isCod ? "COD" : "NON COD"}
            </span>
          </div>
          <div className="flex flex-1 items-center justify-end px-3 py-2">
            <span className="text-sm font-bold">REGULER</span>
          </div>
        </div>

        {/* Kode penjemputan + barcode resi */}
        <div className="flex items-stretch gap-3 border-b-2 border-neutral-900 p-3">
          <div className="flex shrink-0 flex-col items-center justify-center border-2 border-dashed border-neutral-900 px-4 py-2">
            <span className="text-3xl font-black tracking-wide">
              {req.pickupCode ?? "—"}
            </span>
            <span className="mt-0.5 text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Kode Penjemputan
            </span>
          </div>
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
            <Barcode value={req.resiNo} className="h-10 w-full" />
            <p className="border border-neutral-900 px-2 py-1 text-center font-mono text-sm font-bold">
              Resi: {req.resiNo}
            </p>
          </div>
        </div>

        {/* Penerima / Pengirim */}
        <div className="grid grid-cols-2 divide-x-2 divide-neutral-900 border-b-2 border-neutral-900 text-sm">
          <div className="space-y-0.5 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Penerima
            </p>
            <p className="font-bold">
              {req.store.ownerName || "Pemilik konter"}
            </p>
            <p className="font-medium">{req.store.name}</p>
            <p className="text-xs leading-snug">
              {req.store.address || req.store.area || "Alamat belum diisi"}
            </p>
            {req.store.ownerPhone && (
              <p className="text-xs font-medium">
                WA: {req.store.ownerPhone}
              </p>
            )}
          </div>
          <div className="space-y-0.5 p-3">
            <p className="text-[10px] font-medium uppercase tracking-wide text-neutral-500">
              Pengirim
            </p>
            <p className="font-bold">
              {req.store.sales?.name ?? "blm ada"}
            </p>
            {req.store.sales?.phone && (
              <p className="text-xs font-medium">{req.store.sales.phone}</p>
            )}
            <p className="text-xs text-neutral-500">Gudang pusat Ugorex</p>
          </div>
        </div>

        {/* Wilayah + metode bayar + status */}
        <div className="flex items-stretch gap-2 border-b-2 border-neutral-900 p-2 text-xs font-bold">
          <span className="flex-1 border border-neutral-900 px-2 py-1.5 text-center uppercase">
            {req.store.area || "—"}
          </span>
          <span className="flex-1 border border-neutral-900 px-2 py-1.5 text-center">
            {req.paymentMethod
              ? (PAYMENT_METHOD_LABEL[req.paymentMethod] ?? req.paymentMethod)
              : "—"}
            {isCod ? " (COD)" : ""}
          </span>
          <span
            className={`flex-1 border border-neutral-900 px-2 py-1.5 text-center ${
              req.paymentStatus === "PAID" ? "bg-neutral-900 text-white" : ""
            }`}
          >
            {req.paymentStatus === "PAID" ? "LUNAS" : "BELUM BAYAR"}
          </span>
        </div>

        {/* Info pesanan */}
        <div className="flex items-baseline justify-between border-b-2 border-neutral-900 px-3 py-2 text-xs">
          <span>
            <span className="font-bold">No.Pesanan:</span>{" "}
            <span className="font-mono">#{shortId}</span>
          </span>
          <span>
            {fmtDate(req.createdAt, {
              day: "numeric",
              month: "short",
              year: "numeric",
            })}
          </span>
          <span className="font-bold">{totalQty} pcs</span>
        </div>

        {/* Invoice barang */}
        <table className="w-full border-b-2 border-neutral-900 text-xs">
          <thead>
            <tr className="border-b border-neutral-900 text-left">
              <th className="px-2 py-1.5 font-bold">#</th>
              <th className="px-1 py-1.5 font-bold">Kode</th>
              <th className="px-1 py-1.5 font-bold">Nama Produk</th>
              <th className="px-1 py-1.5 text-center font-bold">Qty</th>
              <th className="px-2 py-1.5 text-right font-bold">Total</th>
            </tr>
          </thead>
          <tbody>
            {req.items.map((it, i) => (
              <tr key={it.id} className="border-b border-dashed border-neutral-300 align-top">
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-1 py-1.5 font-mono font-bold">
                  {it.product.code ?? "—"}
                </td>
                <td className="px-1 py-1.5 leading-snug">
                  {it.product.name}
                  <span className="block text-[10px] text-neutral-500">
                    {it.qty} × {rupiah(it.price)}
                  </span>
                </td>
                <td className="px-1 py-1.5 text-center font-bold">{it.qty}</td>
                <td className="px-2 py-1.5 text-right font-medium">
                  {rupiah(it.qty * it.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Total */}
        <div className="space-y-1 border-b-2 border-neutral-900 px-3 py-2 text-xs">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{rupiah(subtotal)}</span>
          </div>
          {totalDiskon > 0 && (
            <div className="flex justify-between">
              <span>Diskon</span>
              <span>-{rupiah(totalDiskon)}</span>
            </div>
          )}
          {req.paymentFee > 0 && (
            <div className="flex justify-between">
              <span>Biaya layanan</span>
              <span>{rupiah(req.paymentFee)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-neutral-900 pt-1 text-sm font-black">
            <span>
              {isCod && req.paymentStatus !== "PAID"
                ? "Tagih COD"
                : "Total Bayar"}
            </span>
            <span>{rupiah(grandTotal)}</span>
          </div>
        </div>

        {/* Footer */}
        <p className="px-3 py-2 text-center font-mono text-[10px] text-neutral-500">
          Pesan: (#{shortId}) ({req.resiNo})
        </p>
      </div>
    </div>
  );
}
