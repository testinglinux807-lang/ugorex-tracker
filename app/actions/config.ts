"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

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
