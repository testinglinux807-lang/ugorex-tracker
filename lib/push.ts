import "server-only";
import webpush from "web-push";
import { prisma } from "./prisma";

// Web Push (notifikasi browser) — gratis, tanpa layanan pihak ketiga.
// Butuh kunci VAPID di .env; kalau kosong, fungsi ini diam saja.

function configured() {
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT ?? "mailto:admin@ugorex.local",
    pub,
    priv,
  );
  return true;
}

export type PushPayload = { title: string; body: string; url?: string };

// Kirim push ke semua perangkat milik user-user tertentu.
// Subscription yang sudah mati (404/410) dibersihkan otomatis.
export async function sendPushToUsers(userIds: string[], payload: PushPayload) {
  if (userIds.length === 0 || !configured()) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId: { in: userIds } },
  });
  if (subs.length === 0) return;

  const body = JSON.stringify(payload);
  const dead: string[] = [];

  await Promise.allSettled(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(s.id);
        else console.error("Web push error:", status, err);
      }
    }),
  );

  if (dead.length > 0) {
    await prisma.pushSubscription.deleteMany({ where: { id: { in: dead } } });
  }
}
