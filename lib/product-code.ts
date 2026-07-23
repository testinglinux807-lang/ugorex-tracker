// Barang sekode = satu KODE mold (mis. "AA16") berbagi stok pusat & harga;
// tiap Product di dalamnya = satu tipe HP (mis. "IPHONE 14 PM"). Nama produk
// disimpan gabungan "Antigores Spy IPHONE 14 PM" - regex ini memisah jadi
// type ("Antigores Spy") + model ("IPHONE 14 PM"). SAMA dengan CodePicker
// (order owner) supaya tampilan konsisten.
export function splitName(name: string): { type: string; model: string } {
  const m = name.match(/^\s*(Antigores\s+\S+)\s+(.+)$/i);
  return m
    ? { type: m[1].trim(), model: m[2].trim() }
    : { type: "", model: name.trim() };
}

// Gabung type + model jadi nama produk. type kosong → nama = model saja.
export function joinName(type: string, model: string): string {
  const t = type.trim();
  const md = model.trim();
  return t ? `${t} ${md}` : md;
}

// Pisah jenis (type) + tipe HP (model) dari 1 produk. Kalau hpModel disimpan
// (Product.hpModel), pakai itu (reliable utk jenis apa pun); kalau null (data
// lama), fallback ke regex splitName (khusus "Antigores ...").
export function productParts(p: {
  name: string;
  hpModel: string | null;
}): { type: string; model: string } {
  if (p.hpModel != null && p.hpModel !== "") {
    const model = p.hpModel;
    const type = p.name.endsWith(model)
      ? p.name.slice(0, p.name.length - model.length).trim()
      : splitName(p.name).type;
    return { type, model };
  }
  return splitName(p.name);
}

export type ProductLite = {
  id: string;
  name: string;
  code: string | null;
  hpModel: string | null;
  price: number;
  centralStock: number;
  description: string | null;
};

export type ProductGroup = {
  key: string; // code, atau __<id> untuk barang tanpa kode
  code: string | null;
  type: string; // "Antigores Spy" - dari model pertama
  price: number;
  centralStock: number;
  members: { id: string; model: string; name: string }[];
};

// Kelompokkan daftar produk per KODE (barang tanpa kode = grup sendiri).
export function groupProductsByCode(products: ProductLite[]): ProductGroup[] {
  const map = new Map<string, ProductGroup>();
  for (const p of products) {
    const key = p.code ?? `__${p.id}`;
    const { type, model } = productParts(p);
    const g =
      map.get(key) ??
      ({
        key,
        code: p.code,
        type,
        price: p.price,
        centralStock: p.centralStock,
        members: [],
      } satisfies ProductGroup);
    // Type & harga diambil dari anggota pertama; stok pusat dibagi sekode.
    g.price = Math.max(g.price, p.price);
    g.centralStock = Math.max(g.centralStock, p.centralStock);
    if (!g.type && type) g.type = type;
    g.members.push({ id: p.id, model, name: p.name });
    map.set(key, g);
  }
  const groups = [...map.values()];
  // Urutkan anggota per nama (deterministik) - anggota[0] jadi "wakil" kode:
  // sama dengan produk perwakilan yang dipilih order owner untuk konter yang
  // belum punya stok (order pilih stok toko tertinggi; awalnya 0 semua →
  // yang pertama secara urutan nama). Biar stok funnel & order satu bucket.
  for (const g of groups) g.members.sort((a, b) => a.name.localeCompare(b.name));
  return groups.sort((a, b) =>
    (a.code ?? a.type).localeCompare(b.code ?? b.type),
  );
}
