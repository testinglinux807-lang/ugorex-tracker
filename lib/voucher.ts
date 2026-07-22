import "server-only";
import { prisma } from "./prisma";

// Cari voucher yang masih bisa dipakai. Mengembalikan { voucher } atau
// { error } dengan pesan yang siap ditampilkan ke user.
export async function findUsableVoucher(codeRaw: string) {
  const code = codeRaw.trim().toUpperCase();
  if (!code) return { error: "Masukkan kode voucher." };

  const voucher = await prisma.voucher.findUnique({
    where: { code },
    include: { product: { select: { name: true, code: true } } },
  });
  if (!voucher || !voucher.active) {
    return { error: "Kode voucher tidak ditemukan atau sudah nonaktif." };
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    return { error: "Voucher sudah kadaluarsa." };
  }
  if (voucher.maxUses != null && voucher.usedCount >= voucher.maxUses) {
    return { error: "Kuota voucher sudah habis." };
  }
  return { voucher };
}

// Konsumsi satu kuota voucher. Guard updateMany (usedCount < maxUses pakai
// nilai saat validasi) mencegah kuota kelewat batas saat dipakai berbarengan.
// false = kuota keburu habis, batalkan transaksi.
export async function consumeVoucher(voucher: {
  id: string;
  maxUses: number | null;
}): Promise<boolean> {
  const res = await prisma.voucher.updateMany({
    where: {
      id: voucher.id,
      active: true,
      ...(voucher.maxUses != null
        ? { usedCount: { lt: voucher.maxUses } }
        : {}),
    },
    data: { usedCount: { increment: 1 } },
  });
  return res.count > 0;
}
