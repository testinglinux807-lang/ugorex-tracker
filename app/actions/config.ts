"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { kpiKey } from "@/lib/kpi-config";
import {
  DEFAULT_LEVEL_TARGETS,
  TARGET_LEVELS,
  KPI_COMPONENTS,
} from "@/lib/sales-kpi-grade";

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

// Admin set target KPI PER LEVEL (Lv 2/3/4 × 5 KPI). Field form: `L{lvl}_{kpi}`.
// Nilai <=0 → jatuh ke default level itu (biar syarat tetap masuk akal).
export async function setKpiTargets(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const ops = [];
  for (const L of TARGET_LEVELS) {
    for (const c of KPI_COMPONENTS) {
      const raw = parseInt(String(formData.get(`L${L}_${c.key}`) ?? ""), 10);
      const val =
        Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_LEVEL_TARGETS[L][c.key];
      ops.push(
        prisma.config.upsert({
          where: { key: kpiKey(L, c.key) },
          update: { value: String(val) },
          create: { key: kpiKey(L, c.key), value: String(val) },
        }),
      );
    }
  }
  await prisma.$transaction(ops);
  revalidatePath("/sales");
  revalidatePath("/beranda");
  return { ok: true };
}
