"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { kpiTargetKey } from "@/lib/kpi-config";
import { DEFAULT_TARGETS, KPI_COMPONENTS } from "@/lib/sales-kpi-grade";

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
