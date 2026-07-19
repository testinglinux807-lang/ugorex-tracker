"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Owner membuat tiket keluhan
export async function createTicket(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa membuat tiket." };
  }

  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) {
    return { error: "Judul dan isi keluhan wajib diisi." };
  }

  await prisma.ticket.create({
    data: {
      storeId: user.ownedStore.id,
      subject,
      message,
      createdById: user.id,
    },
  });
  revalidatePath("/tiket");
  return { ok: true };
}

// Owner kirim feedback satu pintu (menu /feedback): kategori menentukan
// tujuannya — KELUHAN → tiket (masuk inbox Keluhan sales/admin), SARAN &
// BARANG → request bebas (SARAN diberi prefix "[Saran]" di judul biar
// sales/admin langsung tahu jenisnya). Alur staf tidak berubah.
export async function createFeedback(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa mengirim feedback." };
  }

  const kategori = String(formData.get("kategori") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "Judul dan detail wajib diisi." };

  if (kategori === "KELUHAN") {
    await prisma.ticket.create({
      data: {
        storeId: user.ownedStore.id,
        subject,
        message,
        createdById: user.id,
      },
    });
  } else if (kategori === "SARAN" || kategori === "BARANG") {
    await prisma.request.create({
      data: {
        storeId: user.ownedStore.id,
        subject: kategori === "SARAN" ? `[Saran] ${subject}` : subject,
        message,
        createdById: user.id,
      },
    });
    revalidatePath("/request");
  } else {
    return { error: "Pilih kategori dulu." };
  }

  revalidatePath("/feedback");
  revalidatePath("/tiket");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Ubah status tiket (owner untuk tiketnya sendiri, atau admin)
export async function updateTicketStatus(id: string, status: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!["OPEN", "IN_PROGRESS", "CLOSED"].includes(status)) return;

  const ticket = await prisma.ticket.findUnique({ where: { id } });
  if (!ticket) return;
  const allowed =
    user.role === "ADMIN" || ticket.createdById === user.id;
  if (!allowed) return;

  await prisma.ticket.update({ where: { id }, data: { status } });
  revalidatePath("/tiket");
}
