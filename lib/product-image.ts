// URL gambar produk untuk <img>. Foto katalog disimpan sebagai data URI
// (base64) di DB — kalau dipakai langsung sebagai src, base64-nya ikut
// tertanam di HTML/payload halaman (bisa belasan MB kalau muncul berulang
// di riwayat order). Jadi sajikan lewat route API: halaman cuma menggendong
// URL pendek dan browser bisa meng-cache gambarnya.
// ?v= dari panjang data URI dipakai sebagai pembeda versi saat foto diganti.
export function productImageSrc(p: {
  id: string;
  imageUrl: string | null;
}): string | null {
  if (!p.imageUrl) return null;
  if (!p.imageUrl.startsWith("data:")) return p.imageUrl; // URL eksternal biasa
  return `/api/product-image/${p.id}?v=${p.imageUrl.length}`;
}
