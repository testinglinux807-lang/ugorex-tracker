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

// Batas ukuran foto katalog (data URL) ~500KB — foto dikompres di browser
const MAX_IMAGE_LENGTH = 700_000;

function readImageUrl(formData: FormData): string | null {
  const raw = String(formData.get("imageUrl") ?? "").trim();
  if (!raw) return null;
  if (raw.length > MAX_IMAGE_LENGTH) return null;
  if (!raw.startsWith("data:image/") && !/^https?:\/\//.test(raw)) return null;
  return raw;
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
      code: String(formData.get("code") ?? "").trim() || null,
      description: String(formData.get("description") ?? "").trim() || null,
      price,
      imageUrl: readImageUrl(formData),
      centralStock:
        parseInt(String(formData.get("centralStock") ?? "0"), 10) || 0,
    },
  });
  revalidatePath("/data");
  revalidatePath("/pos");
  revalidatePath("/katalog");
}

// Admin mengubah data barang
export async function updateProduct(productId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nama barang wajib diisi." };
  const price = parseInt(String(formData.get("price") ?? "0"), 10) || 0;
  const centralStock =
    parseInt(String(formData.get("centralStock") ?? "0"), 10) || 0;

  await prisma.product.update({
    where: { id: productId },
    data: {
      name,
      code: String(formData.get("code") ?? "").trim() || null,
      price,
      centralStock,
      description: String(formData.get("description") ?? "").trim() || null,
    },
  });
  revalidatePath("/data");
  revalidatePath("/katalog");
  revalidatePath("/pos");
  revalidatePath("/request");
  revalidatePath("/stok");
  return { ok: true };
}

// Admin menghapus barang (ikut menghapus prospek/tracking barang itu;
// riwayat penjualan tetap ada karena nama barang tersimpan snapshot)
export async function deleteProduct(productId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  await prisma.product.delete({ where: { id: productId } });
  revalidatePath("/data");
  revalidatePath("/katalog");
  revalidatePath("/pos");
  revalidatePath("/request");
  revalidatePath("/stok");
  return { ok: true };
}

// Admin mengubah data konter
export async function updateStore(storeId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Nama konter wajib diisi." };

  const latRaw = String(formData.get("lat") ?? "").trim();
  const lngRaw = String(formData.get("lng") ?? "").trim();
  const lat = latRaw ? parseFloat(latRaw) : null;
  const lng = lngRaw ? parseFloat(lngRaw) : null;

  await prisma.store.update({
    where: { id: storeId },
    data: {
      name,
      area: String(formData.get("area") ?? "").trim() || null,
      address: String(formData.get("address") ?? "").trim() || null,
      ownerName: String(formData.get("ownerName") ?? "").trim() || null,
      ownerPhone: String(formData.get("ownerPhone") ?? "").trim() || null,
      lat: lat != null && !Number.isNaN(lat) ? lat : null,
      lng: lng != null && !Number.isNaN(lng) ? lng : null,
      salesId: String(formData.get("salesId") ?? "") || null,
    },
  });
  revalidatePath("/data");
  revalidatePath("/prospects");
  revalidatePath(`/konter/${storeId}`);
  return { ok: true };
}

// Admin menghapus konter (ikut menghapus prospek, transaksi, tiket,
// request, dan akun owner toko itu)
export async function deleteStore(storeId: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const store = await prisma.store.findUnique({ where: { id: storeId } });
  if (!store) return { error: "Konter tidak ditemukan." };

  await prisma.$transaction([
    prisma.store.delete({ where: { id: storeId } }),
    ...(store.ownerUserId
      ? [prisma.user.delete({ where: { id: store.ownerUserId } })]
      : []),
  ]);
  revalidatePath("/data");
  revalidatePath("/prospects");
  revalidatePath("/dashboard");
  return { ok: true };
}

// Admin mengubah stok pusat/gudang sebuah barang
export async function updateProductStock(productId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin yang bisa ubah stok pusat." };

  const raw = String(formData.get("centralStock") ?? "").trim();
  const stock = parseInt(raw, 10);
  if (raw === "" || Number.isNaN(stock) || stock < 0) {
    return { error: "Isi stok yang benar (angka 0 atau lebih)." };
  }

  await prisma.product.update({
    where: { id: productId },
    data: { centralStock: stock },
  });
  revalidatePath("/data");
  revalidatePath("/request");
  revalidatePath("/katalog");
  return { ok: true };
}

// Ganti/pasang foto barang (dari menu Data)
export async function updateProductImage(productId: string, formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") return { error: "Tidak punya akses." };

  const imageUrl = readImageUrl(formData);
  if (!imageUrl) return { error: "Foto tidak valid atau terlalu besar." };

  await prisma.product.update({ where: { id: productId }, data: { imageUrl } });
  revalidatePath("/data");
  revalidatePath("/katalog");
  return { ok: true };
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

  // Sales hanya boleh menawarkan ke konternya sendiri
  if (user.role === "SALES") {
    const store = await prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.salesId !== user.id) redirect("/katalog");
  }

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
