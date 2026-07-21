import Image from "next/image";
import type { Prisma } from "@prisma/client";
import { PAYMENT_METHOD_LABEL } from "@/lib/payment-fee";
import { fmtDate } from "@/lib/date";

// Label resi 100×150mm — dipakai halaman cetak satuan (/order/[id]/resi)
// dan cetak massal (/order/resi-massal). Root ber-atribut data-resi-fit:
// ResiFitScale men-skala TIAP label sendiri-sendiri (CSS var --resi-*
// per elemen), CSS print-nya di components/ResiPrintStyle.tsx.

export type ResiOrder = Prisma.RequestGetPayload<{
  include: {
    store: { include: { sales: true } };
    items: { include: { product: { select: { name: true; code: true } } } };
  };
}>;

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// ===== Barcode Code 128 (bisa discan) =====
// Tabel lebar modul standar Code 128 (nilai 0-105, start A/B/C, stop);
// tiap simbol 6 angka = lebar bar/spasi bergantian (mulai bar), stop 7.
const CODE128_WIDTHS = (
  "212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 " +
  "221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 " +
  "221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 " +
  "212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 " +
  "231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
  "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 " +
  "314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 " +
  "112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 " +
  "111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 " +
  "214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 " +
  "114131 311141 411131 211412 211214 211232 2331112"
).split(" ");

// Susun nilai simbol: Start B untuk huruf, pindah Code C untuk deretan
// angka di ekor (resi UGX + 12 digit → digit dipadatkan 2 digit/simbol),
// lalu checksum modulo 103 + stop — sesuai spesifikasi Code 128.
function code128Values(value: string): number[] {
  let head = value;
  let digits = "";
  const m = value.match(/^([\x20-\x7E]*?)(\d+)$/);
  if (m && m[2].length >= 4) {
    head = m[1];
    digits = m[2];
    if (digits.length % 2 === 1) {
      head += digits[0];
      digits = digits.slice(1);
    }
  }
  const vals = [104]; // Start B
  for (const ch of head) vals.push(ch.charCodeAt(0) - 32);
  if (digits) {
    vals.push(99); // pindah Code C
    for (let i = 0; i < digits.length; i += 2) {
      vals.push(parseInt(digits.slice(i, i + 2), 10));
    }
  }
  let sum = vals[0];
  for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
  vals.push(sum % 103, 106); // checksum + stop
  return vals;
}

function Barcode({ value, className }: { value: string; className?: string }) {
  const QUIET = 10; // quiet zone kiri-kanan (modul putih) — wajib utk scanner
  const bars: { x: number; w: number }[] = [];
  let x = QUIET;
  for (const v of code128Values(value)) {
    const widths = CODE128_WIDTHS[v];
    for (let i = 0; i < widths.length; i++) {
      const w = Number(widths[i]);
      if (i % 2 === 0) bars.push({ x, w });
      x += w;
    }
  }
  const total = x + QUIET;
  return (
    <svg
      viewBox={`0 0 ${total} 40`}
      preserveAspectRatio="none"
      className={className}
      aria-label={`Barcode ${value}`}
    >
      {bars.map((b, i) => (
        <rect key={i} x={b.x} y={0} width={b.w} height={40} fill="#000" />
      ))}
    </svg>
  );
}

// ===== Label =====
export function ResiLabel({ order: req }: { order: ResiOrder }) {
  const isCod = req.paymentMethod === "CASH";
  const totalQty = req.items.reduce((a, i) => a + i.qty, 0);
  const subtotal = req.items.reduce((a, i) => a + i.qty * i.price, 0);
  const totalDiskon = req.discount + req.grosirDiscount;
  const grandTotal = req.total + req.paymentFee;

  return (
    // font-semibold menyeluruh: printer termal sering "menghilangkan"
    // teks tipis/abu — semua teks label dibuat tebal & hitam pekat
    <div
      data-resi-fit
      className="ug-resi mx-auto w-full max-w-md border-2 border-neutral-900 bg-white font-semibold text-neutral-900"
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
            {req.pickupCode ?? "-"}
          </span>
          <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-neutral-900">
            Kode Penjemputan
          </span>
        </div>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <Barcode value={req.resiNo ?? ""} className="h-10 w-full" />
          <p className="border border-neutral-900 px-2 py-1 text-center font-mono text-sm font-bold">
            Resi: {req.resiNo}
          </p>
        </div>
      </div>

      {/* Penerima / Pengirim */}
      <div className="grid grid-cols-2 divide-x-2 divide-neutral-900 border-b-2 border-neutral-900 text-sm">
        <div className="space-y-0.5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-900">
            Penerima
          </p>
          <p className="font-bold">{req.store.ownerName || "Pemilik konter"}</p>
          <p className="font-bold">{req.store.name}</p>
          <p className="text-xs leading-snug">
            {req.store.address || req.store.area || "Alamat belum diisi"}
          </p>
          {req.store.ownerPhone && (
            <p className="text-xs font-bold">WA: {req.store.ownerPhone}</p>
          )}
        </div>
        <div className="space-y-0.5 p-3">
          <p className="text-[10px] font-bold uppercase tracking-wide text-neutral-900">
            Pengirim
          </p>
          <p className="font-bold">{req.store.sales?.name ?? "blm ada"}</p>
          {req.store.sales?.phone && (
            <p className="text-xs font-bold">{req.store.sales.phone}</p>
          )}
          <p className="text-xs text-neutral-900">Gudang pusat Ugorex</p>
        </div>
      </div>

      {/* Wilayah + metode bayar + status */}
      <div className="flex items-stretch gap-2 border-b-2 border-neutral-900 p-2 text-xs font-bold">
        <span className="flex-1 border border-neutral-900 px-2 py-1.5 text-center uppercase">
          {req.store.area || "-"}
        </span>
        <span className="flex-1 border border-neutral-900 px-2 py-1.5 text-center">
          {req.paymentMethod
            ? (PAYMENT_METHOD_LABEL[req.paymentMethod] ?? req.paymentMethod)
            : "-"}
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

      {/* Info pesanan — identitas cukup nomor resi (sudah di atas) */}
      <div className="flex items-baseline justify-between border-b-2 border-neutral-900 px-3 py-2 text-xs">
        <span>
          <span className="font-bold">Tanggal:</span>{" "}
          {fmtDate(req.createdAt, {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </span>
        <span className="font-bold">{totalQty} pcs</span>
      </div>

      {/* Invoice barang. Item sedikit (≤6): tabel penuh berkolom. Item
          banyak: daftar dipecah DUA KOLOM berdampingan — tinggi label
          terpangkas setengah sehingga auto-fit tidak perlu mengecilkan
          font sampai tak terbaca. */}
      {req.items.length <= 6 ? (
        <table className="w-full border-b-2 border-neutral-900 text-xs print:flex-1">
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
              <tr
                key={it.id}
                className="border-b border-dashed border-neutral-500 align-top"
              >
                <td className="px-2 py-1.5">{i + 1}</td>
                <td className="px-1 py-1.5 font-mono font-bold">
                  {it.product.code ?? "-"}
                </td>
                <td className="px-1 py-1.5 leading-snug">
                  {it.product.name}
                  {it.price > 0 && (
                    <span className="block text-[10px] text-neutral-900">
                      {it.qty} × {rupiah(it.price)}
                    </span>
                  )}
                </td>
                <td className="px-1 py-1.5 text-center font-bold">{it.qty}</td>
                <td className="px-2 py-1.5 text-right font-bold">
                  {rupiah(it.qty * it.price)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        (() => {
          const mid = Math.ceil(req.items.length / 2);
          const halves = [req.items.slice(0, mid), req.items.slice(mid)];
          return (
            <div className="grid grid-cols-2 divide-x-2 divide-neutral-900 border-b-2 border-neutral-900 text-[11px] leading-snug print:flex-1">
              {halves.map((half, hi) => (
                <div
                  key={hi}
                  className="divide-y divide-dashed divide-neutral-500"
                >
                  {half.map((it, i) => (
                    <div
                      key={it.id}
                      className="flex items-start justify-between gap-1.5 px-2 py-1"
                    >
                      <span className="min-w-0">
                        <span className="font-mono font-bold">
                          {hi * mid + i + 1}. {it.product.code ?? "-"}
                        </span>{" "}
                        {it.product.name}
                        {it.price > 0 && (
                          <span className="block text-[9px]">
                            {it.qty} × {rupiah(it.price)} ={" "}
                            {rupiah(it.qty * it.price)}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 font-black">×{it.qty}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          );
        })()
      )}

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
            {isCod && req.paymentStatus !== "PAID" ? "Tagih COD" : "Total Bayar"}
          </span>
          <span>{rupiah(grandTotal)}</span>
        </div>
      </div>

      {/* Footer */}
      <p className="px-3 py-2 text-center font-mono text-[10px] text-neutral-900">
        {req.resiNo}
      </p>
    </div>
  );
}
