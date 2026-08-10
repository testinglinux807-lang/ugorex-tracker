import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function randomDate(start, end) {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randArr(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function main() {
  console.log("Mempersiapkan data dummy lengkap...");
  const pass = await bcrypt.hash("Ugorex123!", 10);

  // --- 1. USERS ---
  console.log("Seeding Users...");
  const admin = await prisma.user.upsert({
    where: { phone: "08111111111" },
    update: {},
    create: { name: "Super Admin", phone: "08111111111", passwordHash: pass, role: "ADMIN" }
  });

  const gudang = await prisma.user.upsert({
    where: { phone: "08222222222" },
    update: {},
    create: { name: "Staff Gudang", phone: "08222222222", passwordHash: pass, role: "GUDANG", basePay: 2000000 }
  });

  const salesData = ["Andi", "Budi", "Citra"].map((nama, i) => ({
    name: `Sales ${nama}`,
    phone: `0833333333${i}`,
    passwordHash: pass,
    role: "SALES",
    commissionPct: 5,
    homeLat: -6.3 + (Math.random() * 0.1),
    homeLng: 107.3 + (Math.random() * 0.1)
  }));
  
  const salesUsers = [];
  for (const s of salesData) {
    const user = await prisma.user.upsert({
      where: { phone: s.phone }, update: {}, create: s
    });
    salesUsers.push(user);
  }

  // --- 2. PRODUCTS ---
  console.log("Seeding Products...");
  const produkNama = ["Tempered Glass Clear", "TG Anti-Spy", "Softcase Bening", "Kabel Type-C", "Charger 20W"];
  const products = [];
  for (let i = 0; i < produkNama.length; i++) {
    const p = await prisma.product.upsert({
      where: { id: `PRD-DUMMY-${i}` },
      update: {},
      create: {
        id: `PRD-DUMMY-${i}`,
        name: produkNama[i],
        price: randInt(15, 50) * 1000,
        centralStock: randInt(100, 1000)
      }
    });
    products.push(p);
  }

  // --- 3. STORES & OWNERS ---
  console.log("Seeding Stores & Owners...");
  const stores = [];
  const wilayahList = ["Karawang Barat", "Telukjambe", "Klari", "Cikampek"];
  for (let i = 1; i <= 15; i++) {
    const s = randArr(salesUsers);
    
    // Bikin User Owner
    const owner = await prisma.user.upsert({
      where: { phone: `084444444${i.toString().padStart(2, '0')}` },
      update: {},
      create: { 
        name: `Juragan ${i}`, 
        phone: `084444444${i.toString().padStart(2, '0')}`, 
        passwordHash: pass, 
        role: "OWNER" 
      }
    });

    const store = await prisma.store.upsert({
      where: { ownerUserId: owner.id },
      update: {},
      create: {
        name: `Konter Maju ${i}`,
        area: randArr(wilayahList),
        address: `Jl. Raya Dummy No. ${i}`,
        ownerName: owner.name,
        ownerPhone: owner.phone,
        ownerUserId: owner.id,
        salesId: s.id,
        lat: -6.3 + (Math.random() * 0.1),
        lng: 107.3 + (Math.random() * 0.1),
        createdAt: randomDate(new Date(2026, 0, 1), new Date()),
      }
    });
    stores.push(store);

    // --- 4. FUNNEL (PROSPECTS & LOGS) ---
    // Tiap store kita buatkan 2 produk prospek
    const stages = ["AWARENESS", "CONSIDERATION", "CONVERSION", "LOYALTY"];
    for (let j = 0; j < 2; j++) {
      const prd = products[j];
      const stage = randArr(stages);
      
      const prospect = await prisma.prospect.upsert({
        where: { storeId_productId: { storeId: store.id, productId: prd.id } },
        update: {},
        create: {
          storeId: store.id,
          productId: prd.id,
          stage: stage,
          salesId: s.id,
          stock: stage === "CONVERSION" || stage === "LOYALTY" ? randInt(10, 50) : 0,
        }
      });

      // Tambahkan Log
      await prisma.stageLog.create({
        data: {
          prospectId: prospect.id,
          stage: stage,
          result: "POSITIVE",
          note: `Dummy interaksi tahap ${stage}`,
          salesId: s.id,
        }
      });
    }

    // --- 5. ORDERS (REQUEST RESTOK) ---
    // Beberapa store sudah pernah belanja
    if (Math.random() > 0.3) {
      const req = await prisma.request.create({
        data: {
          storeId: store.id,
          subject: "Restok Mingguan",
          message: "Tolong kirim seperti biasa ya.",
          status: "COMPLETED",
          total: randInt(100, 500) * 1000,
          paymentStatus: "PAID",
          paymentMethod: "CASH",
          createdAt: randomDate(new Date(2026, 4, 1), new Date()),
          items: {
            create: [
              { productId: products[0].id, qty: randInt(5, 20), price: products[0].price },
              { productId: products[1].id, qty: randInt(5, 20), price: products[1].price }
            ]
          }
        }
      });

      // Catat ke Buku Kas (Finance)
      await prisma.financeEntry.create({
        data: {
          type: "INCOME",
          amount: req.total,
          category: "Pemasukan Restok",
          note: `Lunas order restok Konter ${store.name}`,
          date: req.createdAt,
          sourceId: req.id
        }
      });
    }

    // --- 6. TRANSAKSI POS (SALE) ---
    // Seolah-olah konter nyatat penjualan ecer
    await prisma.sale.create({
      data: {
        storeId: store.id,
        productId: products[0].id,
        productName: products[0].name,
        qty: 1,
        price: products[0].price,
        total: products[0].price,
        createdAt: new Date()
      }
    });
  }

  // --- 7. TIKET KELUHAN & TUGAS ---
  console.log("Seeding Tickets & Tasks...");
  await prisma.ticket.create({
    data: {
      storeId: stores[0].id,
      subject: "Barang cacat",
      message: "Bang, TG nya pecah satu pas dikirim.",
      status: "OPEN",
    }
  });

  await prisma.task.create({
    data: {
      title: "Kunjungi konter baru",
      note: "Coba tawarkan produk TG Anti-Spy",
      priority: "HIGH",
      status: "PENDING",
      assignedToId: salesUsers[0].id,
      storeId: stores[1].id
    }
  });

  // --- 8. CONFIG / GROSIR ---
  await prisma.config.upsert({
    where: { key: "target_bulanan" },
    update: {}, create: { key: "target_bulanan", value: "250000000" }
  });

  console.log("SEEDING LENGKAP SELESAI!");
  console.log("Akun Admin: 08111111111 / Ugorex123!");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
