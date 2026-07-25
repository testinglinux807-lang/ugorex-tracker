import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  console.log("Menghapus data toko, prospek, dan user...");
  await prisma.stageLog.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.prospect.deleteMany();
  await prisma.store.deleteMany();
  await prisma.user.deleteMany();
  console.log("Data bersih! Katalog produk tetap aman.");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
