"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Admin memberi tugas manual ke seorang sales — muncul di tab Tugas sales.
export async function createTask(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return { error: "Hanya admin yang bisa memberi tugas." };
  }

  const assignedToId = String(formData.get("assignedToId") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const priority =
    String(formData.get("priority") ?? "NORMAL") === "HIGH" ? "HIGH" : "NORMAL";
  const storeId = String(formData.get("storeId") ?? "").trim() || null;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();

  if (!assignedToId || !title) {
    return { error: "Sales tujuan & judul tugas wajib diisi." };
  }

  // Pastikan tujuan memang akun sales
  const sales = await prisma.user.findUnique({
    where: { id: assignedToId },
    select: { role: true },
  });
  if (!sales || sales.role !== "SALES") {
    return { error: "Tujuan tugas harus akun sales." };
  }

  const due = dueRaw ? new Date(dueRaw) : null;

  await prisma.task.create({
    data: {
      title,
      note: note || null,
      priority,
      dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
      storeId,
      assignedToId,
      createdById: user.id,
    },
  });
  revalidatePath("/tugas");
  return { ok: true };
}

// Sales yang ditugaskan (atau admin) menandai tugas selesai / buka lagi.
export async function setTaskDone(id: string, done: boolean) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const task = await prisma.task.findUnique({
    where: { id },
    select: { assignedToId: true },
  });
  if (!task) return;
  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && task.assignedToId === user.id);
  if (!allowed) return;

  await prisma.task.update({
    where: { id },
    data: {
      status: done ? "DONE" : "PENDING",
      completedAt: done ? new Date() : null,
    },
  });
  revalidatePath("/tugas");
}

// Admin menghapus tugas
export async function deleteTask(id: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return;
  await prisma.task.delete({ where: { id } });
  revalidatePath("/tugas");
}
