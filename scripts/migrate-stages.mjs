// Migrasi nilai tahap funnel lama (AIDA) ke skema baru (18 Jul 2026):
//   INTEREST & DESIRE -> CONSIDERATION
//   ACTION            -> CONVERSION
//   AWARENESS & LOYALTY tetap; STAR_SELLER tahap baru (manual).
// Aman dijalankan berulang — nilai yang sudah baru tidak tersentuh.
//
//   node scripts/migrate-stages.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const MAP = [
  { from: ["INTEREST", "DESIRE"], to: "CONSIDERATION" },
  { from: ["ACTION"], to: "CONVERSION" },
];

for (const { from, to } of MAP) {
  const [p, l] = await Promise.all([
    prisma.prospect.updateMany({
      where: { stage: { in: from } },
      data: { stage: to },
    }),
    prisma.stageLog.updateMany({
      where: { stage: { in: from } },
      data: { stage: to },
    }),
  ]);
  console.log(`${from.join("/")} -> ${to}: ${p.count} prospek, ${l.count} log`);
}

await prisma.$disconnect();
