import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCatalog } from "../scripts/seed-catalog.mjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const pass = await bcrypt.hash("password123", 10);

  // --- Users ---
  const admin = await prisma.user.upsert({
    where: { phone: "0800000001" },
    update: {},
    create: {
      name: "Admin Ugorex",
      phone: "0800000001",
      passwordHash: pass,
      role: "ADMIN",
    },
  });

  const sales = await prisma.user.upsert({
    where: { phone: "0811111111" },
    update: {},
    create: {
      name: "Budi (Sales)",
      phone: "0811111111",
      passwordHash: pass,
      role: "SALES",
      createdById: admin.id,
    },
  });

  // --- Katalog produk: snapshot sheet "base sku" (prisma/catalog-seed.json,
  // 1 produk = 1 model HP, kode mold AA01-AA75 dipakai bersama) ---
  // Hanya untuk DB yang katalognya masih kosong; DB hidup jangan diganti
  // dari sini (ganti total manual: node scripts/seed-catalog.mjs --force).
  if ((await prisma.product.count()) === 0) {
    await seedCatalog(prisma);
  } else {
    console.log("Katalog sudah terisi - lewati seed produk.");
  }

  // Barang contoh untuk demo prospek & stok diambil dari katalog asli:
  // dua barang sekode (kompatibel, satu stok fisik) buat nguji pencarian
  // POS — cari salah satu modelnya, model sekode lain ikut muncul.
  const antigores = await prisma.product.findFirst({
    orderBy: { code: "asc" },
  });
  if (!antigores) throw new Error("Katalog kosong - seed produk gagal?");
  const sameCode = await prisma.product.findMany({
    where: { code: antigores.code },
    orderBy: { name: "asc" },
    take: 2,
  });
  const tgOppo = sameCode[0] ?? antigores;
  const tgXiaomi = sameCode[1] ?? antigores;

  // --- Stores (Konter) ---
  const konterA = await prisma.store.upsert({
    where: { id: "store-konter-a" },
    update: { area: "Karawang Barat", lat: -6.3227, lng: 107.3376 },
    create: {
      id: "store-konter-a",
      name: "Konter A",
      area: "Karawang Barat",
      address: "Jl. Tuparev No. 1, Karawang",
      ownerName: "Pak Andi",
      ownerPhone: "0822222222",
      lat: -6.3227,
      lng: 107.3376,
      salesId: sales.id,
    },
  });

  const konterB = await prisma.store.upsert({
    where: { id: "store-konter-b" },
    update: { area: "Karawang Timur", lat: -6.2912, lng: 107.3651 },
    create: {
      id: "store-konter-b",
      name: "Konter B",
      area: "Karawang Timur",
      address: "Jl. Kertabumi No. 5, Karawang",
      ownerName: "Bu Sari",
      ownerPhone: "0833333333",
      lat: -6.2912,
      lng: 107.3651,
      salesId: sales.id,
    },
  });

  // --- Owner toko demo (terhubung ke Konter B) ---
  const owner = await prisma.user.upsert({
    where: { phone: "0855555555" },
    update: {},
    create: {
      name: "Bu Sari (Owner)",
      phone: "0855555555",
      passwordHash: pass,
      role: "OWNER",
      createdById: sales.id,
    },
  });
  await prisma.store.update({
    where: { id: konterB.id },
    data: { ownerUserId: owner.id },
  });

  // Stok dua barang kode AA01 di Konter B — biar owner bisa nyoba Catat
  // Penjualan + pencarian kompatibel (kode sama) di POS.
  for (const p of [tgOppo, tgXiaomi]) {
    await prisma.prospect.upsert({
      where: { storeId_productId: { storeId: konterB.id, productId: p.id } },
      update: { stock: 10, stage: "CONVERSION" },
      create: {
        storeId: konterB.id,
        productId: p.id,
        stage: "CONVERSION",
        stock: 10,
        salesId: sales.id,
      },
    });
  }

  // --- Prospect: Antigores @ Konter A (ditawarkan, ditolak di awareness) ---
  const prospectA = await prisma.prospect.upsert({
    where: { storeId_productId: { storeId: konterA.id, productId: antigores.id } },
    update: {},
    create: {
      storeId: konterA.id,
      productId: antigores.id,
      stage: "AWARENESS",
      salesId: sales.id,
    },
  });

  await prisma.stageLog.deleteMany({ where: { prospectId: prospectA.id } });
  await prisma.stageLog.create({
    data: {
      prospectId: prospectA.id,
      stage: "AWARENESS",
      result: "REJECTED",
      note: "Sudah ditawarkan ke tokonya tapi langsung ditolak.",
      quantity: 0,
      salesId: sales.id,
    },
  });

  // --- Prospect: Antigores @ Konter B (tertarik, sampai consideration) ---
  const prospectB = await prisma.prospect.upsert({
    where: { storeId_productId: { storeId: konterB.id, productId: antigores.id } },
    update: {},
    create: {
      storeId: konterB.id,
      productId: antigores.id,
      stage: "CONSIDERATION",
      salesId: sales.id,
    },
  });

  await prisma.stageLog.deleteMany({ where: { prospectId: prospectB.id } });
  await prisma.stageLog.createMany({
    data: [
      {
        prospectId: prospectB.id,
        stage: "AWARENESS",
        result: "POSITIVE",
        note: "Ditawarkan, owner mau lihat sampelnya.",
        quantity: 0,
        salesId: sales.id,
      },
      {
        prospectId: prospectB.id,
        stage: "CONSIDERATION",
        result: "POSITIVE",
        note: "Tertarik, tanya harga grosir dan minta 5 unit untuk dicoba.",
        quantity: 5,
        salesId: sales.id,
      },
    ],
  });

  // --- Sales kedua (untuk leaderboard) ---
  const dewi = await prisma.user.upsert({
    where: { phone: "0812222222" },
    update: {},
    create: {
      name: "Dewi (Sales)",
      phone: "0812222222",
      passwordHash: pass,
      role: "SALES",
      createdById: admin.id,
    },
  });
  // Konter di Cikampek dipegang Dewi
  await prisma.store.updateMany({
    where: { area: "Cikampek" },
    data: { salesId: dewi.id },
  });

  // Catatan: transaksi penjualan (Sale) TIDAK di-seed — datanya real dari POS owner.

  console.log("Seed selesai.");
  console.log("Login: 0800000001 / password123 (Admin)");
  console.log("Login: 0811111111 / password123 (Sales Budi)");
  console.log("Login: 0812222222 / password123 (Sales Dewi)");
  console.log("Login: 0855555555 / password123 (Owner)");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
