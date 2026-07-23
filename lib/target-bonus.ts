import "server-only";
import { randomBytes } from "crypto";
import { prisma } from "./prisma";
import { wibMonthStart, periodMonthStart } from "./date";
import { periodShift } from "./sales-score-history";

// "2026-07" (WIB) - format period TargetBonusPeriod.period &
// StoreMonthlyBonus.period, sama dgn lib/sales-score-history.ts wibPeriod.
export function wibPeriod(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" })
    .format(d)
    .slice(0, 7);
}

function genVoucherCode(): string {
  return `BONUS${randomBytes(3).toString("hex").toUpperCase()}`;
}

// Target & hadiah "Target Bulanan" BULAN TERTENTU (default bulan berjalan) —
// admin bisa set beda-beda tiap bulan (menu Data - Voucher Toko). null kalau
// bulan itu belum di-set (fitur nonaktif bulan itu).
export async function getTargetBonusConfig(
  period: string = wibPeriod(),
): Promise<{
  qty: number;
  productId: string | null;
  productName: string | null;
}> {
  const row = await prisma.targetBonusPeriod.findUnique({
    where: { period },
    include: { product: { select: { name: true } } },
  });
  if (!row) return { qty: 0, productId: null, productName: null };
  return { qty: row.qty, productId: row.productId, productName: row.product.name };
}

// Daftar semua bulan yang sudah di-set admin (terbaru dulu) — buat kelola
// jadwal di menu Data.
export async function listTargetBonusPeriods() {
  return prisma.targetBonusPeriod.findMany({
    include: { product: { select: { name: true, code: true } } },
    orderBy: { period: "desc" },
  });
}

// Total pcs order RESTOK (beli dari Ugorex, lunas & tidak batal) toko ini
// bulan berjalan (WIB) - basis "Target Bulanan". Penjualan POS (ke customer
// toko itu sendiri) TIDAK dihitung - fitur ini dorong owner rajin RESTOK,
// bukan rajin jualan (itu ranahnya sendiri, tidak perlu bonus dari kita).
export async function getStoreRestockQtyThisMonth(
  storeId: string,
): Promise<number> {
  const monthStart = wibMonthStart();
  const rows = await prisma.requestItem.findMany({
    where: {
      request: {
        storeId,
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        createdAt: { gte: monthStart },
      },
    },
    select: { qty: true },
  });
  return rows.reduce((a, r) => a + r.qty, 0);
}

// Voucher bonus yang bisa langsung diklaim (tombol "Ambil Voucher") —
// bentuknya persis AppliedVoucher (components/VoucherInput.tsx) supaya bisa
// langsung disodorkan ke RestockCheckout tanpa owner ngetik ulang kodenya.
export type ClaimableVoucher = {
  code: string;
  type: string;
  value: number;
  productId: string | null;
  productCode: string | null;
  productName: string | null;
};

export type MonthlyBonusProgress = {
  qty: number;
  productName: string;
  sold: number;
  reached: boolean;
  voucherCode: string | null;
  voucherUsed: boolean;
  // true kalau owner sudah "menggores" & buka kodenya (StoreMonthlyBonus.
  // claimedAt terisi) - kartu gores tampil kode langsung, tidak minta gores
  // ulang tiap refresh.
  revealed: boolean;
  claimVoucher: ClaimableVoucher | null;
  period: string;
};

// Progres "Target Bulanan" toko ini buat kartu boost di /order - baca saja,
// tidak menerbitkan voucher (itu tugas ensureMonthlyBonusVoucher).
export async function getMonthlyBonusProgress(
  storeId: string,
): Promise<MonthlyBonusProgress | null> {
  const period = wibPeriod();
  const [config, sold] = await Promise.all([
    getTargetBonusConfig(period),
    getStoreRestockQtyThisMonth(storeId),
  ]);
  if (config.qty <= 0 || !config.productId) return null; // belum di-set admin

  const claim = await prisma.storeMonthlyBonus.findUnique({
    where: { storeId_period: { storeId, period } },
    include: {
      voucher: {
        select: {
          code: true,
          type: true,
          value: true,
          productId: true,
          usedCount: true,
          product: { select: { name: true, code: true } },
        },
      },
    },
  });
  const v = claim?.voucher ?? null;
  // usedCount > 0 = udah beneran dipakai checkout (bukan cuma di-seed ke
  // keranjang) - jangan tawarin klaim lagi kalau udah kepakai.
  const used = (v?.usedCount ?? 0) > 0;
  return {
    qty: config.qty,
    productName: config.productName ?? "produk",
    sold,
    reached: sold >= config.qty,
    voucherCode: v?.code ?? null,
    voucherUsed: used,
    revealed: claim?.claimedAt != null,
    claimVoucher:
      v && !used
        ? {
            code: v.code,
            type: v.type,
            value: v.value,
            productId: v.productId,
            productCode: v.product?.code ?? null,
            productName: v.product?.name ?? null,
          }
        : null,
    period,
  };
}

// Tandai voucher bonus bulan ini sudah "digores"/dibuka owner (sekali saja).
export async function markMonthlyBonusRevealed(storeId: string) {
  const period = wibPeriod();
  await prisma.storeMonthlyBonus.updateMany({
    where: { storeId, period, claimedAt: null },
    data: { claimedAt: new Date() },
  });
}

// Versi batch buat sales — progres "Target Bulanan" semua konter yang dia
// pegang sekaligus (dipakai di /order supaya sales tahu konter mana yang
// tinggal sedikit lagi, biar bisa didorong). null (bukan Map kosong) kalau
// admin belum men-set target bulan ini sama sekali.
export async function getMonthlyBonusProgressBatch(
  storeIds: string[],
): Promise<Map<string, MonthlyBonusProgress> | null> {
  const period = wibPeriod();
  const config = await getTargetBonusConfig(period);
  if (config.qty <= 0 || !config.productId || storeIds.length === 0) {
    return null;
  }

  const monthStart = wibMonthStart();
  const [itemRows, claims] = await Promise.all([
    prisma.requestItem.findMany({
      where: {
        request: {
          storeId: { in: storeIds },
          paymentStatus: "PAID",
          status: { not: "CANCELLED" },
          createdAt: { gte: monthStart },
        },
      },
      select: { qty: true, request: { select: { storeId: true } } },
    }),
    prisma.storeMonthlyBonus.findMany({
      where: { storeId: { in: storeIds }, period },
      include: { voucher: { select: { code: true, usedCount: true } } },
    }),
  ]);
  const soldBy = new Map<string, number>();
  for (const i of itemRows) {
    const sid = i.request.storeId;
    soldBy.set(sid, (soldBy.get(sid) ?? 0) + i.qty);
  }
  const claimBy = new Map(claims.map((c) => [c.storeId, c.voucher]));

  const out = new Map<string, MonthlyBonusProgress>();
  for (const storeId of storeIds) {
    const sold = soldBy.get(storeId) ?? 0;
    const v = claimBy.get(storeId) ?? null;
    out.set(storeId, {
      qty: config.qty,
      productName: config.productName ?? "produk",
      sold,
      reached: sold >= config.qty,
      voucherCode: v?.code ?? null,
      voucherUsed: (v?.usedCount ?? 0) > 0,
      revealed: false, // batch cuma buat daftar ringkas sales, tak dipakai
      claimVoucher: null,
      period,
    });
  }
  return out;
}

// Cek + terbitkan voucher bonus toko ini kalau baru saja mencapai target
// bulan ini (dipanggil tiap /order dibuka, fire-and-forget via after() -
// order restok berubah status di banyak tempat/waktu berbeda - lebih
// gampang & aman dicek ulang tiap halaman dibuka daripada nge-hook tiap
// titik perubahan paymentStatus). Idempoten: StoreMonthlyBonus
// @@unique([storeId, period]) mencegah diterbitkan dobel.
export async function ensureMonthlyBonusVoucher(storeId: string) {
  try {
    const period = wibPeriod();
    const config = await getTargetBonusConfig(period);
    if (config.qty <= 0 || !config.productId) return;

    const sold = await getStoreRestockQtyThisMonth(storeId);
    if (sold < config.qty) return;

    const existing = await prisma.storeMonthlyBonus.findUnique({
      where: { storeId_period: { storeId, period } },
    });
    if (existing) return; // sudah pernah diterbitkan bulan ini

    // maxUses 1: tetap cuma 1 pcs FREE per redeem, per rumus FREE di
    // lib/voucher-calc.ts (motong 1 unit produk, bukan seluruh qty).
    const code = genVoucherCode();
    const voucher = await prisma.voucher.create({
      data: {
        code,
        type: "FREE",
        value: 0,
        productId: config.productId,
        storeId,
        maxUses: 1,
      },
    });
    await prisma.storeMonthlyBonus.create({
      data: { storeId, period, voucherId: voucher.id },
    });
  } catch {
    // Best-effort - jangan ganggu alur order kalau ini gagal.
  }
}

export type BonusHistoryRow = {
  period: string;
  qty: number;
  productName: string;
  sold: number;
  reached: boolean;
  voucherCode: string | null;
  voucherUsed: boolean;
};

// Riwayat "Target Bulanan" toko ini — SEMUA bulan yang pernah admin
// jadwalkan (TargetBonusPeriod), kecuali bulan berjalan (itu urusan kartu
// boost, bukan riwayat). Ditampilkan biar owner bisa lihat bulan lalu
// tercapai/enggak, dan voucher hadiahnya udah dipakai belum.
export async function getStoreBonusHistory(
  storeId: string,
): Promise<BonusHistoryRow[]> {
  const currentPeriod = wibPeriod();
  const periods = await prisma.targetBonusPeriod.findMany({
    where: { period: { not: currentPeriod } },
    include: { product: { select: { name: true } } },
    orderBy: { period: "desc" },
  });
  if (periods.length === 0) return [];

  const claims = await prisma.storeMonthlyBonus.findMany({
    where: { storeId, period: { in: periods.map((p) => p.period) } },
    include: {
      voucher: { select: { code: true, usedCount: true, maxUses: true } },
    },
  });
  const claimBy = new Map(claims.map((c) => [c.period, c]));

  const rows = await Promise.all(
    periods.map(async (p) => {
      const start = periodMonthStart(p.period);
      const end = periodMonthStart(periodShift(p.period, 1));
      const items = await prisma.requestItem.findMany({
        where: {
          request: {
            storeId,
            paymentStatus: "PAID",
            status: { not: "CANCELLED" },
            createdAt: { gte: start, lt: end },
          },
        },
        select: { qty: true },
      });
      const sold = items.reduce((a, r) => a + r.qty, 0);
      const claim = claimBy.get(p.period);
      return {
        period: p.period,
        qty: p.qty,
        productName: p.product.name,
        sold,
        reached: sold >= p.qty,
        voucherCode: claim?.voucher?.code ?? null,
        voucherUsed: (claim?.voucher?.usedCount ?? 0) > 0,
      };
    }),
  );
  return rows;
}
