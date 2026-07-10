import "server-only";
import { prisma } from "./prisma";

// Satukan keuangan dengan penjualan order: setiap order restock yang sudah
// LUNAS otomatis tercatat sebagai pemasukan di buku kas (kategori
// "Penjualan Order", tanggal = tanggal order, sourceId = id order).
//
// Dipanggil saat halaman /keuangan atau export dibuka — rekonsiliasi ini
// menangkap order yang lunas lewat jalur mana pun (webhook Midtrans,
// polling, tandai cash) tanpa perlu menyisipkan pencatatan di tiap jalur
// pembayaran. Idempoten: sourceId @unique + skipDuplicates menjamin satu
// order hanya tercatat sekali, dipanggil berbarengan pun aman.
export async function syncOrderIncome(): Promise<void> {
  const paid = await prisma.request.findMany({
    where: {
      items: { some: {} },
      paymentStatus: "PAID",
      total: { gt: 0 },
    },
    select: {
      id: true,
      total: true,
      createdAt: true,
      store: { select: { name: true } },
    },
  });
  if (paid.length === 0) return;

  const existing = new Set(
    (
      await prisma.financeEntry.findMany({
        where: { sourceId: { in: paid.map((r) => r.id) } },
        select: { sourceId: true },
      })
    ).map((e) => e.sourceId),
  );
  const missing = paid.filter((r) => !existing.has(r.id));
  if (missing.length === 0) return;

  await prisma.financeEntry.createMany({
    data: missing.map((r) => ({
      type: "INCOME",
      amount: r.total,
      category: "Penjualan Order",
      note: `Order #${r.id.slice(-8).toUpperCase()} — ${r.store.name}`,
      date: r.createdAt,
      sourceId: r.id,
    })),
    skipDuplicates: true,
  });
}
