"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { kpiTargetKey } from "@/lib/kpi-config";
import { DEFAULT_TARGETS, KPI_COMPONENTS } from "@/lib/sales-kpi-grade";
import { markMonthlyBonusRevealed } from "@/lib/target-bonus";

export async function setMonthlyTarget(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const target = parseInt(String(formData.get("target") ?? "0"), 10) || 0;
  if (target < 0) return { error: "Target tidak valid." };

  await prisma.config.upsert({
    where: { key: "monthly_target" },
    update: { value: String(target) },
    create: { key: "monthly_target", value: String(target) },
  });
  revalidatePath("/dashboard");
  return { ok: true };
}

// Admin set SATU set target KPI ("bulan ideal" = skor 100%). Field form:
// `t_{kpi}`. Nilai <=0 → jatuh ke default (biar skor tetap masuk akal).
export async function setKpiTargets(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const ops = [];
  for (const c of KPI_COMPONENTS) {
    const raw = parseInt(String(formData.get(`t_${c.key}`) ?? ""), 10);
    const val = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TARGETS[c.key];
    ops.push(
      prisma.config.upsert({
        where: { key: kpiTargetKey(c.key) },
        update: { value: String(val) },
        create: { key: kpiTargetKey(c.key), value: String(val) },
      }),
    );
  }
  await prisma.$transaction(ops);
  revalidatePath("/sales");
  revalidatePath("/beranda");
  revalidatePath("/tugas");
  return { ok: true };
}

// Admin set kontak CS Ugorex — ditampilkan di /profil owner ("Hubungi CS").
export async function setCsContact(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const name = String(formData.get("name") ?? "").trim() || "CS Ugorex";
  const phone = String(formData.get("phone") ?? "").trim();

  await prisma.$transaction([
    prisma.config.upsert({
      where: { key: "cs_name" },
      update: { value: name },
      create: { key: "cs_name", value: name },
    }),
    prisma.config.upsert({
      where: { key: "cs_phone" },
      update: { value: phone },
      create: { key: "cs_phone", value: phone },
    }),
  ]);
  revalidatePath("/data");
  revalidatePath("/profil");
  return { ok: true };
}

// Admin set "Target Bulanan" SATU BULAN (menu Data - Voucher Toko): target
// qty & produk hadiah - beda bulan boleh beda produk/target. Lihat
// lib/target-bonus.ts. Timpa kalau bulan itu sudah pernah di-set.
export async function setTargetBonus(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const period = String(formData.get("period") ?? "").trim();
  const qty = parseInt(String(formData.get("qty") ?? "0"), 10) || 0;
  const productId = String(formData.get("productId") ?? "").trim();
  if (!/^\d{4}-\d{2}$/.test(period)) return { error: "Pilih bulannya dulu." };
  if (qty < 1) return { error: "Target pcs minimal 1." };
  if (!productId) return { error: "Pilih produk hadiahnya." };

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return { error: "Produk tidak valid." };

  await prisma.targetBonusPeriod.upsert({
    where: { period },
    update: { qty, productId },
    create: { period, qty, productId },
  });
  revalidatePath("/data");
  revalidatePath("/order");
  return { ok: true };
}

// Admin hapus jadwal "Target Bulanan" 1 bulan (batal, bukan reward yg
// sudah terlanjur diterbitkan - voucher yang sudah keluar tetap berlaku).
export async function deleteTargetBonusPeriod(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return;
  await prisma.targetBonusPeriod.delete({ where: { id } }).catch(() => {});
  revalidatePath("/data");
  revalidatePath("/order");
}

// Owner menandai voucher bonus bulan ini sudah "digores"/dibuka (sekali) -
// dipanggil ClaimScratchCard begitu goresan selesai, biar tidak minta gores
// ulang tiap refresh.
export async function revealMonthlyBonus() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) return;
  await markMonthlyBonusRevealed(user.ownedStore.id);
  revalidatePath("/order");
}
