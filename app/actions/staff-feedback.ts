"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { publishRealtime } from "@/lib/realtime";
import { notifyStaffFeedbackReply } from "@/lib/wa-notify";
import { isFeedbackKind } from "@/lib/feedback-kind";

// Sales mengirim keluhan/saran/pengajuan barang untuk dirinya sendiri ke
// admin (bukan atas nama konter — itu lewat createFeedback di tickets.ts).
export async function createStaffFeedback(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "SALES") {
    return { error: "Hanya sales yang bisa mengirim feedback ke admin." };
  }

  const kind = String(formData.get("kind") ?? "");
  if (!isFeedbackKind(kind)) return { error: "Pilih kategori dulu." };

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "Judul dan detail wajib diisi." };

  await prisma.staffFeedback.create({
    data: { kind, subject, message, createdById: user.id },
  });

  revalidatePath("/request");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  publishRealtime("feedback");
  return { ok: true };
}

// Admin membalas feedback sales — pengirimnya dikabari (in-app + WA + push).
export async function respondStaffFeedback(id: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return { error: "Hanya admin yang bisa membalas feedback sales." };
  }

  const response = String(formData.get("response") ?? "").trim();
  if (!response) return { error: "Isi balasan dulu." };

  const fb = await prisma.staffFeedback.findUnique({
    where: { id },
    select: { createdById: true },
  });
  if (!fb) return { error: "Feedback tidak ditemukan." };

  await prisma.staffFeedback.update({
    where: { id },
    data: {
      response,
      respondedBy: `${user.name} (Admin)`,
      respondedAt: new Date(),
    },
  });

  // Jangan kirim notif kalau admin membalas feedback-nya sendiri
  if (fb.createdById !== user.id) after(() => notifyStaffFeedbackReply(id));
  revalidatePath("/request");
  revalidatePath("/", "layout");
  return { ok: true };
}

// Admin menandai feedback sales selesai / buka lagi.
export async function updateStaffFeedbackStatus(id: string, status: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return;
  if (!["PENDING", "COMPLETED"].includes(status)) return;

  await prisma.staffFeedback.update({ where: { id }, data: { status } });
  revalidatePath("/request");
  revalidatePath("/", "layout");
}
