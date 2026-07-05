import { prisma } from "@/lib/prisma";

// Sajikan foto bukti pengiriman order (data URI di DB) sebagai gambar biasa
// — pola sama dengan /api/product-image supaya base64 tidak menggenduti
// payload halaman. Dilindungi middleware (butuh sesi login).
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  const { requestId } = await params;
  const request = await prisma.request.findUnique({
    where: { id: requestId },
    select: { deliveryPhoto: true },
  });

  const url = request?.deliveryPhoto;
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
      "Content-Type": mime || "image/webp",
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
}
