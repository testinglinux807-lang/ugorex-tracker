import "server-only";
import { prisma } from "./prisma";
import { waNumber } from "./wa";
import { sendPushToUsers } from "./push";

// Notifikasi WhatsApp otomatis via gateway Fonnte (fonnte.com).
// Isi FONNTE_TOKEN di .env untuk mengaktifkan; kosong = tidak kirim apa-apa.
// APP_URL (opsional) dipakai untuk menyertakan link halaman Order.

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Kirim satu pesan WA. Tidak pernah melempar error — notifikasi gagal
// tidak boleh menggagalkan alur utama.
export async function sendWa(phone: string, message: string) {
  const token = process.env.FONNTE_TOKEN;
  const target = waNumber(phone);
  if (!token || !target) return;
  try {
    const res = await fetch("https://api.fonnte.com/send", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({ target, message }),
      cache: "no-store",
    });
    if (!res.ok) console.error("Fonnte error:", res.status, await res.text());
  } catch (err) {
    console.error("Fonnte unreachable:", err);
  }
}

// Kabari soal order restok lewat WA (Fonnte, kalau token diisi) dan
// Web Push (kalau VAPID diisi). Penerima tergantung jenis kabar:
// kind "paid"      = pembayaran Midtrans lunas → sales pemegang toko + admin;
// kind "new"       = order dibuat tanpa pembayaran online (Midtrans off) → idem;
// kind "shipped"   = barang mulai dikirim sales → OWNER toko;
// kind "delivered" = barang sampai (report sales) → OWNER toko.
export async function notifyOrder(
  requestId: string,
  kind: "new" | "paid" | "shipped" | "delivered",
) {
  const waEnabled = !!process.env.FONNTE_TOKEN;
  const pushEnabled =
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY;
  // Tanpa WA/push pun lanjut: riwayat notifikasi in-app (lonceng) tetap dicatat.

  const order = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      store: { include: { sales: true } },
      createdBy: true,
      items: { include: { product: true } },
    },
  });
  if (!order || order.items.length === 0) return;

  const toOwner = kind === "shipped" || kind === "delivered";
  const phones = new Set<string>();
  const userIds = new Set<string>();
  if (toOwner) {
    if (order.store.ownerPhone) phones.add(order.store.ownerPhone);
    if (order.store.ownerUserId) userIds.add(order.store.ownerUserId);
  } else {
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
    const recipients = [
      ...(order.store.sales ? [order.store.sales] : []),
      ...admins,
    ];
    for (const u of recipients) {
      if (u.phone) phones.add(u.phone);
      userIds.add(u.id);
    }
  }
  if (phones.size === 0 && userIds.size === 0) return;

  const lines = order.items
    .slice(0, 5)
    .map((it) => `- ${it.product.name} x${it.qty}`);
  if (order.items.length > 5)
    lines.push(`- +${order.items.length - 5} barang lainnya`);

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const no = order.id.slice(-8).toUpperCase();

  const message =
    kind === "shipped"
      ? [
          `Order #${no} SEDANG DIKIRIM`,
          ``,
          `Barang restok Anda sedang dalam pengiriman, mohon ditunggu.`,
          ``,
          ...lines,
          ``,
          `Total: ${rupiah(order.total)}`,
          ...(appUrl ? [``, `Pantau: ${appUrl}/order`] : []),
        ].join("\n")
      : kind === "delivered"
      ? [
          `Order #${no} SAMPAI - barang sudah diterima`,
          ``,
          ...(order.deliveredBy ? [`Diserahkan oleh: ${order.deliveredBy}`] : []),
          ...(order.deliveryNote ? [`Catatan: ${order.deliveryNote}`] : []),
          ``,
          ...lines,
          ``,
          `Total: ${rupiah(order.total)}`,
          ...(appUrl ? [``, `Lihat bukti: ${appUrl}/order`] : []),
        ].join("\n")
      : [
          kind === "paid"
            ? `Order #${no} SUDAH DIBAYAR - siap diproses`
            : `Order Restok Baru #${no}`,
          ``,
          `Toko: ${order.store.name}${order.store.area ? ` (${order.store.area})` : ""}`,
          `Oleh: ${order.createdBy?.name ?? "-"}`,
          ``,
          ...lines,
          ``,
          `Total: ${rupiah(order.total)}${kind === "paid" ? " (lunas)" : " (belum dibayar)"}`,
          ...(appUrl ? [``, `Proses: ${appUrl}/order`] : []),
        ].join("\n");

  // ?focus= membawa langsung ke kartu order-nya di halaman Order
  // (dipindah ke urutan teratas + di-highlight)
  const orderUrl = `/order?focus=${order.id}`;
  const push =
    kind === "shipped"
      ? {
          title: `Order #${no} sedang dikirim`,
          body: `Barang restok Anda sedang dikirim, mohon ditunggu — ${order.items.length} barang`,
          url: orderUrl,
        }
      : kind === "delivered"
      ? {
          title: `Order #${no} sudah sampai`,
          body: `${order.deliveredBy ? `Diserahkan ${order.deliveredBy} — ` : ""}${order.items.length} barang diterima, lihat bukti fotonya`,
          url: orderUrl,
        }
      : {
          title:
            kind === "paid"
              ? `Order #${no} sudah dibayar`
              : `Order restok baru #${no}`,
          body: `${order.store.name} — ${rupiah(order.total)} (${order.items.length} barang)`,
          url: orderUrl,
        };

  const tasks: Promise<unknown>[] = [];
  // Riwayat in-app (inbox lonceng di header) — selalu dicatat
  if (userIds.size > 0) {
    tasks.push(
      prisma.notification.createMany({
        data: [...userIds].map((userId) => ({
          userId,
          title: push.title,
          body: push.body,
          url: push.url,
        })),
      }),
    );
  }
  if (waEnabled) {
    tasks.push(...[...phones].map((p) => sendWa(p, message)));
  }
  if (pushEnabled) {
    tasks.push(sendPushToUsers([...userIds], push));
  }
  await Promise.allSettled(tasks);
}
