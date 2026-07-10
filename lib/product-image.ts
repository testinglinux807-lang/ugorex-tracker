import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

// Foto katalog & bukti kirim disimpan sebagai data URI (base64) di DB dan
// disajikan lewat route API (/api/product-image, /api/delivery-photo) supaya
// halaman cuma menggendong URL pendek. Kolom base64-nya di-omit global di
// lib/prisma.ts — untuk membangun URL <img>, halaman cukup tahu panjang data
// URI (pembeda versi ?v=) yang dihitung di SQL lewat length(), tanpa pernah
// menarik isi fotonya dari Neon.

type ImgRow = { id: string; len: number | null; ext: string | null };

function toSrc(kind: "product-image" | "delivery-photo", r: ImgRow) {
  if (r.ext) return r.ext; // URL eksternal biasa — pakai apa adanya
  if (r.len == null) return null; // tanpa foto
  return `/api/${kind}/${r.id}?v=${r.len}`;
}

// Map productId -> src untuk <img> (URL route API atau URL eksternal;
// null = tanpa foto). Tanpa argumen: seluruh katalog.
export async function productImageSrcMap(
  ids?: string[],
): Promise<Map<string, string | null>> {
  if (ids && ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<ImgRow[]>`
    SELECT id,
           length("imageUrl")::int AS len,
           CASE WHEN "imageUrl" LIKE 'data:%' THEN NULL ELSE "imageUrl" END AS ext
    FROM "Product"
    ${ids ? Prisma.sql`WHERE id IN (${Prisma.join(ids)})` : Prisma.empty}`;
  return new Map(rows.map((r) => [r.id, toSrc("product-image", r)]));
}

// Map requestId -> src foto bukti pengiriman — pola sama dengan produk.
export async function deliveryPhotoSrcMap(
  ids: string[],
): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await prisma.$queryRaw<ImgRow[]>`
    SELECT id,
           length("deliveryPhoto")::int AS len,
           CASE WHEN "deliveryPhoto" LIKE 'data:%' THEN NULL ELSE "deliveryPhoto" END AS ext
    FROM "Request"
    WHERE id IN (${Prisma.join(ids)})`;
  return new Map(rows.map((r) => [r.id, toSrc("delivery-photo", r)]));
}
