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
  console.log("Mempersiapkan data dummy ekstensif & tersinkronisasi...");
  const pass = await bcrypt.hash("Ugorex123!", 10);

  const namaDepan = ["Andi", "Budi", "Citra", "Dewi", "Eko", "Fajar", "Gilang", "Hendra", "Indra", "Joko", "Kartika", "Lestari", "Mulyadi", "Nugroho", "Reza", "Sari", "Tono", "Wahyu", "Yoga", "Zainal"];
  const namaKonter = ["Cahaya Cell", "Berkah Komunika", "Maju Jaya Aksesoris", "Bintang Ponsel", "Raja Case", "Sumber Rejeki", "Global Phone", "Pelangi Cellular", "Sentra Gadget", "Mitra Mandiri", "Makmur Store", "Amanah Cell", "Lancar Jaya", "Kharisma Phone", "Dunia Gadget", "Pusat Aksesoris", "Zetaphone", "Delta Cell", "Omega Komunika", "Prima Cell"];
  const namaJalan = ["Jl. Pahlawan", "Jl. Jend. Sudirman", "Jl. Ahmad Yani", "Jl. Diponegoro", "Jl. Gajah Mada", "Jl. Merdeka", "Jl. Gatot Subroto", "Jl. Veteran", "Jl. K.H. Dewantara", "Jl. Melati", "Jl. Mawar"];
  const prefixHp = ["0812", "0852", "0838", "0813", "0819", "0857", "0896"];

  function randPhone() {
    return randArr(prefixHp) + randInt(10000000, 99999999).toString();
  }

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
    create: { name: "Agus (Gudang)", phone: "08222222222", passwordHash: pass, role: "GUDANG", basePay: 2000000 }
  });

  const namaSales = ["Rizky Pratama", "Dedi Kurniawan", "Agus Setiawan", "Siti Aisyah", "Faisal Akbar", "Tari Larasati"];
  const salesUsers = [];
  for (const nama of namaSales) {
    const user = await prisma.user.upsert({
      where: { phone: randPhone() }, // Karena random, kita asumsikan belum ada, atau tangkap error
      update: {},
      create: {
        name: nama,
        phone: randPhone(),
        passwordHash: pass,
        role: "SALES",
        commissionPct: 5, // 5% komisi
        homeLat: -6.2819 + (Math.random() * 0.05 - 0.025),
        homeLng: 107.3728 + (Math.random() * 0.05 - 0.025),
        createdAt: randomDate(new Date(2025, 6, 1), new Date(2025, 11, 31))
      }
    });
    salesUsers.push(user);
  }

  // Objek untuk melacak total omzet per sales (untuk dihitung komisinya nanti)
  const omzetPerSales = {};
  for (const s of salesUsers) omzetPerSales[s.id] = 0;

  // --- 2. PRODUCTS ---
  console.log("Seeding Products...");
  const produkNama = ["Tempered Glass Clear", "TG Anti-Spy", "Softcase Bening", "Kabel Type-C", "Charger 20W", "Headset Bluetooth", "Powerbank 10000mAh", "Holder HP", "Lanyard / Tali HP", "Ring Stand"];
  const products = [];
  for (let i = 0; i < produkNama.length; i++) {
    const hargaJual = randInt(15, 80) * 1000;
    const p = await prisma.product.upsert({
      where: { id: `PRD-DUMMY-${i}` },
      update: {},
      create: {
        id: `PRD-DUMMY-${i}`,
        name: produkNama[i],
        price: hargaJual,
        centralStock: randInt(500, 2000)
      }
    });
    products.push(p);
  }

  // --- 3. STORES, PROSPECTS, ORDERS, & SALES (POS) ---
  console.log("Seeding 60 Stores & generating synced transactions...");
  const stores = [];
  const wilayahList = ["Karawang Barat", "Telukjambe", "Klari", "Cikampek", "Rengasdengklok", "Cilamaya", "Purwasari", "Kosambi"];
  
  for (let i = 1; i <= 60; i++) {
    const s = randArr(salesUsers);
    
    // Bikin User Owner realistis
    const ownerName = randArr(namaDepan) + " " + randArr(namaDepan);
    const ownerPhone = randPhone();
    const owner = await prisma.user.upsert({
      where: { phone: ownerPhone },
      update: {},
      create: { 
        name: ownerName, 
        phone: ownerPhone, 
        passwordHash: pass, 
        role: "OWNER" 
      }
    });

    const store = await prisma.store.upsert({
      where: { ownerUserId: owner.id },
      update: {},
      create: {
        name: randArr(namaKonter) + (Math.random() > 0.5 ? " " + randInt(1, 9) : ""),
        area: randArr(wilayahList),
        address: `${randArr(namaJalan)} No. ${randInt(1, 150)}, ${randArr(wilayahList)}`,
        ownerName: owner.name,
        ownerPhone: owner.phone,
        ownerUserId: owner.id,
        salesId: s.id,
        lat: -6.2819 + (Math.random() * 0.1 - 0.05),
        lng: 107.3728 + (Math.random() * 0.1 - 0.05),
        createdAt: randomDate(new Date(2025, 0, 1), new Date(2026, 2, 1)),
      }
    });
    stores.push(store);

    // -- Funnel / Prospects --
    // Kita buat 3 prospek per toko
    const prospectStages = ["AWARENESS", "CONSIDERATION", "CONVERSION", "LOYALTY", "STAR_SELLER"];
    for (let j = 0; j < 3; j++) {
      const prd = randArr(products);
      const stage = randArr(prospectStages);
      
      const prospect = await prisma.prospect.upsert({
        where: { storeId_productId: { storeId: store.id, productId: prd.id } },
        update: {},
        create: {
          storeId: store.id,
          productId: prd.id,
          stage: stage,
          salesId: s.id,
          stock: (stage === "CONVERSION" || stage === "LOYALTY" || stage === "STAR_SELLER") ? randInt(10, 100) : 0,
        }
      });

      // Hapus log lama dulu jika dijalankan berulang
      await prisma.stageLog.deleteMany({
        where: { prospectId: prospect.id, note: "Interaksi awal kunjungan sales" }
      });
      await prisma.stageLog.create({
        data: {
          prospectId: prospect.id,
          stage: stage,
          result: "POSITIVE",
          note: "Interaksi awal kunjungan sales",
          salesId: s.id,
        }
      });
    }

    // -- Orders (Request) & Finance --
    // Setiap toko melakukan 1 sampai 5 kali restok
    const numOrders = randInt(1, 5);
    for (let o = 0; o < numOrders; o++) {
      const p1 = randArr(products);
      const p2 = randArr(products);
      const qty1 = randInt(5, 50);
      const qty2 = randInt(5, 50);
      const totalOrder = (p1.price * qty1) + (p2.price * qty2);

      const reqDate = randomDate(new Date(2026, 0, 1), new Date());
      
      const req = await prisma.request.create({
        data: {
          storeId: store.id,
          subject: "Restok Dagangan",
          message: "Kirim secepatnya bos",
          status: "COMPLETED",
          total: totalOrder,
          paymentStatus: "PAID",
          paymentMethod: randArr(["CASH", "VA_BCA", "QRIS", "GOPAY"]),
          createdAt: reqDate,
          items: {
            create: [
              { productId: p1.id, qty: qty1, price: p1.price },
              { productId: p2.id, qty: qty2, price: p2.price }
            ]
          }
        }
      });

      // Sinkronisasi: Catat sebagai Pemasukan di Buku Kas (FinanceEntry)
      await prisma.financeEntry.create({
        data: {
          type: "INCOME",
          amount: totalOrder,
          category: "Pemasukan Restok",
          note: `Lunas order restok Konter ${store.name}`,
          date: reqDate,
          sourceId: req.id
        }
      });

      // Tambahkan omzet ke Sales yang pegang toko ini
      omzetPerSales[s.id] += totalOrder;

      // -- POS Sales (Eceran dari toko) --
      // Seolah-olah konter nyatat penjualan eceran dari barang yang direstok
      const numPosSales = randInt(2, 8);
      for (let pos = 0; pos < numPosSales; pos++) {
        const prdToSell = Math.random() > 0.5 ? p1 : p2;
        const qtyEcer = randInt(1, 3);
        const hargaEcer = prdToSell.price + 5000; // Markup harga jual toko

        await prisma.sale.create({
          data: {
            storeId: store.id,
            productId: prdToSell.id,
            productName: prdToSell.name,
            qty: qtyEcer,
            price: hargaEcer,
            total: hargaEcer * qtyEcer,
            createdAt: randomDate(reqDate, new Date()) // Terjual setelah order masuk
          }
        });
      }
    }
  }

  // --- 4. PAYROLL & COMMISSION (SYNC) ---
  console.log("Seeding Payroll & Commission...");
  for (const s of salesUsers) {
    const totalOmzet = omzetPerSales[s.id];
    if (totalOmzet > 0) {
      // Hitung komisi 5% dari total omzet untuk dicatat sebagai dibayarkan
      const komisi = Math.floor(totalOmzet * 0.05);

      const payout = await prisma.commissionPayout.create({
        data: {
          salesId: s.id,
          amount: komisi,
          note: `Pencairan komisi 5% (Total Omzet Dummy: Rp${totalOmzet.toLocaleString('id-ID')})`,
          createdAt: new Date(),
        }
      });

      // Sinkronisasi: Catat sebagai Pengeluaran di Buku Kas
      await prisma.financeEntry.create({
        data: {
          type: "EXPENSE",
          amount: komisi,
          category: "Gaji & Komisi Sales",
          note: `Pencairan Komisi - ${s.name}`,
          date: new Date(),
          sourceId: payout.id, // Terkunci dengan CommissionPayout
        }
      });
    }
  }

  // --- 5. TIKET KELUHAN & TUGAS ---
  console.log("Seeding Tickets & Tasks...");
  for (let i = 0; i < 5; i++) {
    await prisma.ticket.create({
      data: {
        storeId: randArr(stores).id,
        subject: randArr(["Barang rusak", "Salah kirim", "Kurang jumlah", "Minta retur"]),
        message: "Min tolong diurusin keluhan saya ini ya. Urgent.",
        status: randArr(["OPEN", "IN_PROGRESS", "CLOSED"]),
        createdAt: randomDate(new Date(2026, 4, 1), new Date())
      }
    });

    await prisma.task.create({
      data: {
        title: randArr(["Kunjungi konter", "Tawarkan produk baru", "Follow up tagihan"]),
        note: "Harap segera diselesaikan minggu ini.",
        priority: randArr(["HIGH", "NORMAL"]),
        status: randArr(["PENDING", "DONE"]),
        assignedToId: randArr(salesUsers).id,
        storeId: randArr(stores).id,
        createdAt: randomDate(new Date(2026, 6, 1), new Date())
      }
    });
  }

  // --- 6. CONFIG ---
  await prisma.config.upsert({
    where: { key: "target_bulanan" },
    update: {}, create: { key: "target_bulanan", value: "250000000" }
  });

  console.log("=========================================");
  console.log("SEEDING LENGKAP & TERSINKRONISASI SELESAI!");
  console.log("Total Stores  : 60");
  console.log("Total Sales   : 6");
  console.log("Total Orders  : (Bervariasi per toko)");
  console.log("Akun Admin    : 08111111111 / Ugorex123!");
  console.log("=========================================");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
