import { prisma } from "@/lib/prisma";

// Sajikan foto produk (data URI di DB) sebagai file gambar biasa.
// Dilindungi middleware (butuh sesi login). URL diberi ?v= oleh
// productImageSrc, jadi aman di-cache lama oleh browser.
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ productId: string }> },
) {
  const { productId } = await params;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true },
  });

  const url = product?.imageUrl;
  if (!url) return new Response("Tidak ada gambar", { status: 404 });
  if (!url.startsWith("data:")) return Response.redirect(url, 302);

  const m = url.match(/^data:([^;,]+)?(;base64)?,([\s\S]*)$/);
  if (!m) return new Response("Gambar tidak valid", { status: 404 });
  const [, mime, isBase64, data] = m;
  const bytes = isBase64
    ? Buffer.from(data, "base64")
    : Buffer.from(decodeURIComponent(data));

  return new Response(bytes, {
    headers: {
      "Content-Type": mime || "image/jpeg",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
