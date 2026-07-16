// Impor katalog antigores dari Google Sheet tab "base sku" (matriks kompatibilitas).
//
// Konsep data (permintaan user 16 Jul 2026): SATU PRODUK = SATU MODEL HP,
// `code` = kode mold (AA01-AA75) yang DIPAKAI BERSAMA oleh semua model yang
// kompatibel — jadi owner mencari "Infinix Zero 5G" langsung ketemu, dan
// stok/harga otomatis bersama per kode (mekanisme lama "barang sekode
// berbagi stok" di app/actions: stockMoveOps, updateProduct, dll).
//
// Struktur sheet: baris 1 = header kolom "[AA 44] ZH 5 clear"; baris 2 =
// "jumlah stok" per kode; baris berikutnya = sel model HP dengan awalan
// emoji tier (🟢 Pas Sempurna, 🟡 Kompatibel, 🟠 Kompatibel dgn Catatan).
// Sel tanpa emoji = baris mold (model dasar cetakan) → dianggap 🟢.
//
// Kolom yang kosong total di sheet (kasus iPhone AA01-AA08 dll yang selnya
// hilang) TIDAK dihapus datanya: produk lama kode itu dipertahankan
// (nama/desc diparse ulang dari DB) supaya katalog iPhone tidak lenyap.
//
// Jalankan: node scripts/import-basesku.mjs
// MENGHAPUS semua Product lalu membuat ulang. Aman hanya kalau belum ada
// transaksi/prospek yang perlu dijaga (cek dulu kalau ragu).

import { PrismaClient } from "@prisma/client";

const SHEET_ID = "1nf7eFIzDv3jcrX4-amUC-FHOBrxCDlXUrqLDtUlQYaY";
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=base%20sku`;

const TIER = {
  "🟢": "PAS SEMPURNA",
  "🟡": "KOMPATIBEL",
  "🟠": "KOMPATIBEL DGN CATATAN",
};
const TIER_RANK = { "PAS SEMPURNA": 0, KOMPATIBEL: 1, "KOMPATIBEL DGN CATATAN": 2 };

// Parser CSV kecil (koma, kutip ganda, newline dalam sel)
function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else inQuotes = false;
      } else cell += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

// "Samsung A54 5G (6,4 inci > ...)" → nama bersih + catatan ukuran/mold
function cleanModel(raw) {
  let note = [];
  let name = raw
    .replace(/\[[^\]]*\]|\([^)]*\)/g, (m) => { note.push(m); return " "; })
    .replace(/\bcocok\s*100%/gi, () => { note.push("cocok 100%"); return " "; })
    .replace(/\bmold\b/gi, () => { note.push("mold dasar"); return " "; })
    .replace(/\s+/g, " ")
    .trim();
  return { name, note: note.join(" ").replace(/\s+/g, " ").trim() || null };
}

const prisma = new PrismaClient();

const res = await fetch(CSV_URL);
if (!res.ok) throw new Error(`Gagal unduh sheet: HTTP ${res.status}`);
const rows = parseCsv(await res.text());
const headers = rows[0];
const stokRow = rows[1];
if (!/jumlah stok/i.test(stokRow[0] ?? "")) {
  throw new Error("Baris 2 bukan 'jumlah stok' — struktur sheet berubah, cek dulu.");
}

// Kolom → info kode
const cols = new Map(); // ci -> { code, variant, mold, stok, models: Map(nameKey -> {name, tier, note}) }
for (let ci = 1; ci < headers.length; ci++) {
  const m = /^\[AA\s*(\d+)\]\s*(.*)$/.exec((headers[ci] ?? "").trim());
  if (!m) continue;
  const label = m[2].trim();
  const variant = /spy/i.test(label) ? "Spy" : "Clear";
  const mold = label
    .replace(/\bclear\b|\bspy\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || null;
  cols.set(ci, {
    code: `AA${String(parseInt(m[1], 10)).padStart(2, "0")}`,
    variant,
    mold,
    stok: parseInt((stokRow[ci] ?? "0").trim(), 10) || 0,
    models: new Map(),
  });
}

for (const r of rows.slice(2)) {
  for (const [ci, info] of cols) {
    for (let part of (r[ci] ?? "").split("\n")) {
      part = part.trim();
      if (!part) continue;
      const emoji = [...part][0];
      const tier = TIER[emoji] ?? "PAS SEMPURNA"; // tanpa emoji = baris mold
      const raw = TIER[emoji] ? part.slice(emoji.length).trim() : part;
      const { name, note } = cleanModel(raw);
      if (!name) continue;
      const key = name.toLowerCase();
      const prev = info.models.get(key);
      // Model dobel di satu kode → simpan tier terbaik
      if (!prev || TIER_RANK[tier] < TIER_RANK[prev.tier]) {
        info.models.set(key, { name, tier, note });
      }
    }
  }
}

// Harga lama per kode + fallback utk kolom yang kosong total di sheet
const existing = await prisma.product.findMany({
  select: { code: true, name: true, price: true, description: true, centralStock: true },
});
const priceByCode = new Map();
for (const p of existing) {
  if (p.code && p.price > 0) priceByCode.set(p.code, p.price);
}

function fallbackModels(code) {
  // Ambil dari produk lama kode itu: era matriks (desc "PAS SEMPURNA: a, b")
  // maupun era per-model (nama produk = modelnya) dua-duanya didukung.
  const olds = existing.filter((p) => p.code === code);
  const models = new Map();
  for (const p of olds) {
    const desc = p.description ?? "";
    if (/PAS SEMPURNA:|KOMPATIBEL:/.test(desc)) {
      for (const line of desc.split("\n")) {
        const m = /^(PAS SEMPURNA|KOMPATIBEL DGN CATATAN|KOMPATIBEL):\s*(.*)$/.exec(line.trim());
        if (!m) continue;
        for (const item of m[2].split(",")) {
          const { name, note } = cleanModel(item.trim());
          if (name) models.set(name.toLowerCase(), { name, tier: m[1], note });
        }
      }
    } else {
      const { name, note } = cleanModel(
        p.name.replace(/^Antigores\s+(Clear|Spy)\s*/i, ""),
      );
      const tier = /^(PAS SEMPURNA|KOMPATIBEL)/.exec(desc)?.[0] ?? "PAS SEMPURNA";
      if (name) models.set(name.toLowerCase(), { name, tier, note });
    }
  }
  return models;
}

const data = [];
const kosong = [];
for (const info of [...cols.values()].sort((a, b) => a.code.localeCompare(b.code))) {
  let models = info.models;
  if (models.size === 0) {
    models = fallbackModels(info.code);
    if (models.size > 0) kosong.push(info.code);
  }
  for (const m of models.values()) {
    const desc = [m.tier, info.mold ? `mold ${info.mold}` : null, m.note]
      .filter(Boolean)
      .join(" · ");
    data.push({
      name: `Antigores ${info.variant} ${m.name}`,
      code: info.code,
      description: desc,
      price: priceByCode.get(info.code) ?? 0,
      centralStock: info.stok,
    });
  }
}

console.log(`Produk baru: ${data.length} (dari ${cols.size} kode)`);
if (kosong.length) {
  console.log(`Kolom kosong di sheet, pakai data lama DB: ${kosong.join(", ")}`);
}

await prisma.$transaction([
  prisma.product.deleteMany({}),
  prisma.product.createMany({ data }),
]);

const perTier = {};
for (const d of data) {
  const t = d.description.split(" · ")[0];
  perTier[t] = (perTier[t] ?? 0) + 1;
}
console.log("Per tier:", perTier);
console.log("Selesai. Contoh AA44:");
for (const d of data.filter((d) => d.code === "AA44").slice(0, 6)) {
  console.log(` - ${d.name} | ${d.description} | stok ${d.centralStock}`);
}
await prisma.$disconnect();
