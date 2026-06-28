"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Owner mengajukan request (mis. minta restok / dikunjungi)
export async function createRequest(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa mengajukan request." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) {
    return { error: "Judul dan isi request wajib diisi." };
  }

  await prisma.request.create({
    data: {
      storeId: user.ownedStore.id,
      subject,
      message,
      createdById: user.id,
    },
  });
  revalidatePath("/request");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Sales (pemegang toko) atau admin menandai status request
export async function updateRequestStatus(id: string, status: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["PENDING", "COMPLETED"].includes(status)) return;

  const req = await prisma.request.findUnique({
    where: { id },
    include: { store: true },
  });
  if (!req) return;

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) return;

  await prisma.request.update({ where: { id }, data: { status } });
  revalidatePath("/request");
}
