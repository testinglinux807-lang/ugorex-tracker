"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { publishRealtime } from "@/lib/realtime";

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
  publishRealtime("tiket");
  return { ok: true };
}

// Feedback konter satu pintu: kategori menentukan tujuannya — KELUHAN →
// tiket (masuk inbox Keluhan sales/admin), SARAN & BARANG → request bebas
// (SARAN diberi prefix "[Saran]" di judul biar sales/admin langsung tahu
// jenisnya). Alur staf tidak berubah.
//
// Dipakai dua pihak:
// - OWNER lewat menu /feedback (toko = tokonya sendiri)
// - SALES lewat menu Feedback (/request) tab "Dari Konter" — konter kadang
//   menyampaikan langsung ke sales, jadi sales yang mencatatkan; wajib
//   pilih konter yang dia pegang (field storeId).
export async function createFeedback(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  let storeId: string;
  if (user.role === "OWNER") {
    if (!user.ownedStore) {
      return { error: "Akun ini belum terhubung ke toko." };
    }
    storeId = user.ownedStore.id;
  } else if (user.role === "SALES") {
    storeId = String(formData.get("storeId") ?? "");
    if (!storeId) return { error: "Pilih konter dulu." };
    const store = await prisma.store.findUnique({
      where: { id: storeId },
      select: { salesId: true },
    });
    if (!store || store.salesId !== user.id) {
      return { error: "Konter ini bukan tanggung jawabmu." };
    }
  } else {
    return { error: "Hanya owner toko atau sales yang bisa kirim feedback." };
  }

  const kategori = String(formData.get("kategori") ?? "");
  const subject = String(formData.get("subject") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  if (!subject || !message) return { error: "Judul dan detail wajib diisi." };

  if (kategori === "KELUHAN") {
    await prisma.ticket.create({
      data: { storeId, subject, message, createdById: user.id },
    });
  } else if (kategori === "SARAN" || kategori === "BARANG") {
    await prisma.request.create({
      data: {
        storeId,
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
  revalidatePath("/tugas");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  publishRealtime("feedback");
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
  publishRealtime("tiket");
}
