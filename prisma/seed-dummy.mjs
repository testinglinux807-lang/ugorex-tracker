import { PrismaClient } from "@prisma/client";
import fs from "fs";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Membaca file JSON...");
  const rawData = fs.readFileSync("ugorex-tracker-dummy-data.json", "utf-8");
  const data = JSON.parse(rawData);

  console.log("Memulai proses seeding...");

  // 1. Seed Produk
  console.log(`Seeding ${data.produk.length} produk...`);
  for (const p of data.produk) {
    await prisma.product.upsert({
      where: { id: p.id },
      update: {
        name: p.nama,
        price: p.jual,
        // modal tidak ada di skema default, tapi bisa diabaikan atau masuk description
        description: `Modal: Rp${p.modal}`,
      },
      create: {
        id: p.id,
        name: p.nama,
        price: p.jual,
        description: `Modal: Rp${p.modal}`,
      },
    });
  }

  // 2. Seed Sales (User)
  console.log(`Seeding ${data.sales.length} sales...`);
  const defaultPassword = await bcrypt.hash("Ugorex123!", 10);
  for (const s of data.sales) {
    await prisma.user.upsert({
      where: { id: s.id },
      update: {
        name: s.nama,
        phone: s.no_hp,
        role: "SALES",
        commissionPct: s.komisi_persen,
      },
      create: {
        id: s.id,
        name: s.nama,
        phone: s.no_hp,
        passwordHash: defaultPassword,
        role: "SALES",
        commissionPct: s.komisi_persen,
        createdAt: new Date(s.join_date),
      },
    });
  }

  // 3. Seed Konter (Store)
  console.log(`Seeding ${data.konter.length} konter...`);
  for (const k of data.konter) {
    await prisma.store.upsert({
      where: { id: k.id },
      update: {
        name: k.nama,
        area: k.wilayah,
        address: k.alamat,
        salesId: k.sales_id,
        lat: k.lat,
        lng: k.lng,
      },
      create: {
        id: k.id,
        name: k.nama,
        area: k.wilayah,
        address: k.alamat,
        salesId: k.sales_id,
        lat: k.lat,
        lng: k.lng,
        createdAt: new Date(k.tgl_join),
      },
    });

    // Buat Prospect (karena sistem nge-track funnel) untuk konter ini dari produk yang ada
    // Untuk dummy, kita ambil 1-2 produk secara acak sebagai contoh prospect
    // Atau lewati dulu kalau terlalu berat
  }

  // 4. Seed Orders (Request & RequestItem)
  console.log(`Seeding ${data.orders.length} orders...`);
  // Hapus semua request lama kalau mau clean, atau upsert
  for (const o of data.orders) {
    await prisma.request.upsert({
      where: { id: o.id },
      update: {
        total: o.total,
        status: o.status_bayar === "lunas" ? "COMPLETED" : "PENDING",
        paymentStatus: o.status_bayar === "lunas" ? "PAID" : "UNPAID",
        paymentMethod: o.metode.toUpperCase(),
      },
      create: {
        id: o.id,
        storeId: o.konter_id,
        status: o.status_bayar === "lunas" ? "COMPLETED" : "PENDING",
        total: o.total,
        paymentStatus: o.status_bayar === "lunas" ? "PAID" : "UNPAID",
        paymentMethod: o.metode.toUpperCase(),
        createdAt: new Date(o.tanggal),
        items: {
          create: o.items.map(item => ({
            productId: item.produk_id,
            qty: item.qty,
            price: item.harga_satuan,
          }))
        }
      },
    });
  }

  console.log("Seed selesai!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
