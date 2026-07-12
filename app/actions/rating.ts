"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Owner konter menilai sales pemegang tokonya (bintang 1-5 + keterangan) —
// form di halaman POS. Satu konter satu rating; simpan ulang = mengubah.
// Tampil di Performa Sales & detail sales (admin).
export async function rateSales(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER" || !user.ownedStore) {
    return { error: "Hanya owner toko yang bisa memberi rating." };
  }
  const store = user.ownedStore;
  if (!store.salesId) {
    return { error: "Konter ini belum punya sales penanggung jawab." };
  }

  const stars = Number(formData.get("stars"));
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { error: "Pilih bintang 1-5 dulu." };
  }
  const note = String(formData.get("note") ?? "").trim() || null;

  await prisma.salesRating.upsert({
    where: { storeId: store.id },
    create: { storeId: store.id, salesId: store.salesId, stars, note },
    // salesId ikut diperbarui — kalau konter sudah ganti sales, rating
    // baru menilai sales yang sekarang.
    update: { salesId: store.salesId, stars, note },
  });

  revalidatePath("/pos");
  revalidatePath("/sales");
  revalidatePath(`/sales/${store.salesId}`);
  return { ok: true };
}
