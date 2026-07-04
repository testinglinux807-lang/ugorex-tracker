"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";

// Simpan langganan Web Push perangkat ini untuk user yang sedang login
export async function savePushSubscription(sub: {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "Subscription tidak valid." };
  }

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    create: {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
    },
  });
  return { ok: true };
}

// Hapus langganan saat user mematikan notifikasi di perangkat ini
export async function removePushSubscription(endpoint: string) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!endpoint) return { error: "Endpoint kosong." };

  await prisma.pushSubscription.deleteMany({
    where: { endpoint, userId: user.id },
  });
  return { ok: true };
}
