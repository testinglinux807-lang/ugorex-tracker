"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { STAGES, RESULTS, type Stage, type Result } from "@/lib/constants";

// Catat kunjungan: tandai tahap funnel + respon + catatan untuk 1 barang di 1 konter.
// Sekaligus buat/lengkapi prospek dan tambah riwayat.
export async function recordVisit(storeId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") return { error: "Tidak punya akses." };

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return { error: "Konter tidak ditemukan." };
  if (user.role === "SALES" && store.salesId !== user.id) {
    return { error: "Konter ini bukan tanggung jawabmu." };
  }

  const productId = String(formData.get("productId") ?? "");
  const stage = String(formData.get("stage") ?? "") as Stage;
  const result = String(formData.get("result") ?? "NEUTRAL") as Result;
  const note = String(formData.get("note") ?? "").trim();
  const quantity = parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;

  if (!productId) return { error: "Pilih barang dulu." };
  if (!STAGES.includes(stage)) return { error: "Tahap tidak valid." };
  if (!RESULTS.includes(result)) return { error: "Respon tidak valid." };
  if (!note) return { error: "Catatan wajib diisi." };

  const prospect = await prisma.prospect.upsert({
    where: { storeId_productId: { storeId, productId } },
    update: { stage, salesId: store.salesId ?? user.id },
    create: {
      storeId,
      productId,
      stage,
      salesId: store.salesId ?? user.id,
    },
  });

  await prisma.stageLog.create({
    data: {
      prospectId: prospect.id,
      stage,
      result,
      note,
      quantity,
      salesId: user.id,
    },
  });

  revalidatePath(`/konter/${storeId}`);
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Catat kunjungan untuk BEBERAPA barang sekaligus (centang per barang).
export async function recordVisitMulti(storeId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") return { error: "Tidak punya akses." };

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return { error: "Konter tidak ditemukan." };
  if (user.role === "SALES" && store.salesId !== user.id) {
    return { error: "Konter ini bukan tanggung jawabmu." };
  }

  // Tahap, respon, catatan — 1x untuk seluruh kunjungan (mewakili semua barang)
  const stage = String(formData.get("stage") ?? "") as Stage;
  const result = String(formData.get("result") ?? "NEUTRAL") as Result;
  const note = String(formData.get("note") ?? "").trim();

  if (!STAGES.includes(stage)) return { error: "Pilih tahap funnel." };
  if (!RESULTS.includes(result)) return { error: "Pilih respon toko." };
  if (!note) return { error: "Catatan wajib diisi." };

  // Kumpulkan barang yang dicentang (key: sel__<productId>)
  const ids: string[] = [];
  for (const [key, val] of formData.entries()) {
    if (key.startsWith("sel__") && val) ids.push(key.slice(5));
  }
  if (ids.length === 0) return { error: "Pilih minimal satu barang." };

  let count = 0;
  for (const productId of ids) {
    // qty per barang = stok yang dikasih ke konter (ditambahkan ke stok total)
    const qty =
      parseInt(String(formData.get(`qty__${productId}`) ?? "0"), 10) || 0;

    const prospect = await prisma.prospect.upsert({
      where: { storeId_productId: { storeId, productId } },
      update: {
        stage,
        salesId: store.salesId ?? user.id,
        stock: { increment: qty },
      },
      create: {
        storeId,
        productId,
        stage,
        salesId: store.salesId ?? user.id,
        stock: qty,
      },
    });
    await prisma.stageLog.create({
      data: {
        prospectId: prospect.id,
        stage,
        result,
        note,
        quantity: qty,
        salesId: user.id,
      },
    });
    count++;
  }

  revalidatePath(`/konter/${storeId}`);
  revalidatePath("/konter");
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
  return { ok: true, count };
}

// Tambah barang baru
export async function createProduct(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const price = parseInt(String(formData.get("price") ?? "0"), 10) || 0;
  await prisma.product.create({
    data: {
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      price,
    },
  });
  revalidatePath("/data");
  revalidatePath("/pos");
}

// Tambah konter / toko baru
export async function createStore(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  // Sales otomatis jadi penanggung jawab kalau yang input sales
  const salesId =
    user.role === "SALES"
      ? user.id
      : String(formData.get("salesId") ?? "") || null;

  const latRaw = String(formData.get("lat") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;

  await prisma.store.create({
    data: {
      name,
      area: String(formData.get("area") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      ownerName: String(formData.get("ownerName") ?? "").trim() || null,
      ownerPhone: String(formData.get("ownerPhone") ?? "").trim() || null,
      lat: lat != null && !Number.isNaN(lat) ? lat : null,
      lng: lng != null && !Number.isNaN(lng) ? lng : null,
      salesId,
    },
  });
  revalidatePath("/data");
  revalidatePath("/prospects");
}

// Buat prospek baru: barang X di konter Y
export async function createProspect(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const storeId = String(formData.get("storeId") ?? "");
  const productId = String(formData.get("productId") ?? "");
  if (!storeId || !productId) return;

  const existing = await prisma.prospect.findUnique({
    where: { storeId_productId: { storeId, productId } },
  });
  if (existing) {
    redirect(`/prospects/${existing.id}`);
  }

  const prospect = await prisma.prospect.create({
    data: {
      storeId,
      productId,
      stage: "AWARENESS",
      salesId: user.role === "SALES" ? user.id : null,
    },
  });
  redirect(`/prospects/${prospect.id}`);
}

// Tambah update tahap funnel ke sebuah prospek
export async function addStageLog(prospectId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const stage = String(formData.get("stage") ?? "") as Stage;
  const result = String(formData.get("result") ?? "NEUTRAL") as Result;
  const note = String(formData.get("note") ?? "").trim();
  const quantity = parseInt(String(formData.get("quantity") ?? "0"), 10) || 0;

  if (!STAGES.includes(stage)) return { error: "Tahap tidak valid." };
  if (!RESULTS.includes(result)) return { error: "Hasil tidak valid." };
  if (!note) return { error: "Catatan wajib diisi." };

  await prisma.stageLog.create({
    data: {
      prospectId,
      stage,
      result,
      note,
      quantity,
      salesId: user.id,
    },
  });

  // Update tahap saat ini di prospek ke tahap terbaru
  await prisma.prospect.update({
    where: { id: prospectId },
    data: { stage },
  });

  revalidatePath(`/prospects/${prospectId}`);
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
}
