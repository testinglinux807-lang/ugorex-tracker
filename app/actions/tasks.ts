"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Admin memberi tugas manual ke satu / banyak sales sekaligus — muncul di
// tab Tugas masing-masing sales (satu baris Task per sales).
export async function createTask(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") {
    return { error: "Hanya admin yang bisa memberi tugas." };
  }

  const ids = [
    ...new Set(
      formData
        .getAll("assignedToIds")
        .map((v) => String(v).trim())
        .filter(Boolean),
    ),
  ];
  const title = String(formData.get("title") ?? "").trim();
  const note = String(formData.get("note") ?? "").trim();
  const priority =
    String(formData.get("priority") ?? "NORMAL") === "HIGH" ? "HIGH" : "NORMAL";
  const storeId = String(formData.get("storeId") ?? "").trim() || null;
  const dueRaw = String(formData.get("dueDate") ?? "").trim();

  if (ids.length === 0 || !title) {
    return { error: "Pilih minimal satu sales & isi judul tugas." };
  }

  // Pastikan semua tujuan memang akun sales
  const salesCount = await prisma.user.count({
    where: { id: { in: ids }, role: "SALES" },
  });
  if (salesCount !== ids.length) {
    return { error: "Tujuan tugas harus akun sales." };
  }

  const due = dueRaw ? new Date(dueRaw) : null;

  await prisma.task.createMany({
    data: ids.map((assignedToId) => ({
      title,
      note: note || null,
      priority,
      dueDate: due && !Number.isNaN(due.getTime()) ? due : null,
      storeId,
      assignedToId,
      createdById: user.id,
    })),
  });
  revalidatePath("/tugas");
  return { ok: true, count: ids.length };
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
