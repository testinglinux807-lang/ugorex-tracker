import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCatalog } from "../scripts/seed-catalog.mjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  const pass = await bcrypt.hash("Ugorex10##", 10);

  // --- Users ---
  await prisma.user.upsert({
    where: { phone: "083838383499" },
    update: { passwordHash: pass },
    create: {
      name: "Admin Agung Ugorex",
      phone: "083838383499",
      passwordHash: pass,
      role: "ADMIN",
    },
  });

  if ((await prisma.product.count()) === 0) {
    await seedCatalog(prisma);
  } else {
    console.log("Katalog sudah terisi - lewati seed produk.");
  }

  console.log("Seed selesai.");
  console.log("Login Admin: 083838383499 / Ugorex10##");
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
