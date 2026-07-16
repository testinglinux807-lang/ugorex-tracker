// Seed katalog antigores dari snapshot prisma/catalog-seed.json (hasil
// scripts/export-catalog.mjs atas data sheet "base sku": 1 produk = 1 model
// HP, kode mold AA01–AA75 dipakai bersama antar model yang kompatibel).
//
// Mengganti SEMUA produk. Aman untuk DB kosong; di DB berisi, prospek &
// item order ikut terhapus (onDelete Cascade) — makanya diblok kecuali
// dipaksa. Riwayat POS (Sale) aman: productId cuma di-null-kan, nama
// barang tersimpan sebagai snapshot.
//
//   node scripts/seed-catalog.mjs           (diblok kalau ada data terkait)
//   node scripts/seed-catalog.mjs --force   (tetap ganti, cascade jalan)
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export async function seedCatalog(prisma, { force = false } = {}) {
  const products = JSON.parse(
    readFileSync(new URL("../prisma/catalog-seed.json", import.meta.url), "utf8"),
  );

  const [prospects, requestItems] = await Promise.all([
    prisma.prospect.count(),
    prisma.requestItem.count(),
  ]);
  if ((prospects > 0 || requestItems > 0) && !force) {
    console.log(
      `Lewati seed katalog: ada ${prospects} prospek & ${requestItems} item order ` +
        `yang bakal ikut terhapus (cascade). Jalankan dengan --force kalau memang mau ganti total.`,
    );
    return false;
  }

  await prisma.$transaction([
    prisma.product.deleteMany(),
    prisma.product.createMany({ data: products }),
  ]);
  console.log(`Seed katalog: ${products.length} produk dari catalog-seed.json.`);
  return true;
}

// Dijalankan langsung (bukan di-import seed.mjs)
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const prisma = new PrismaClient();
  seedCatalog(prisma, { force: process.argv.includes("--force") })
    .then(() => prisma.$disconnect())
    .catch(async (e) => {
      console.error(e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
