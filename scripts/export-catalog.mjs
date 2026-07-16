// Snapshot katalog produk dari DB → prisma/catalog-seed.json.
// Jalankan SETELAH katalog di DB sudah benar (mis. habis jalanin
// import-basesku.mjs dari sheet "base sku") — hasilnya dipakai
// scripts/seed-catalog.mjs untuk mengisi DB kosong tanpa perlu akses
// Google Sheet ataupun DB lama.
//
//   node scripts/export-catalog.mjs
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";

const prisma = new PrismaClient();

const products = await prisma.product.findMany({
  // id ikut disimpan supaya reseed di DB yang sama tidak mengacak referensi
  select: {
    id: true,
    name: true,
    code: true,
    description: true,
    price: true,
    centralStock: true,
  },
  orderBy: [{ code: "asc" }, { name: "asc" }],
});

const out = new URL("../prisma/catalog-seed.json", import.meta.url);
writeFileSync(out, JSON.stringify(products, null, 1));
console.log(`Tersimpan ${products.length} produk -> prisma/catalog-seed.json`);

await prisma.$disconnect();
