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

// Kabari sales pemegang toko + semua admin soal order restok
// lewat WA (Fonnte, kalau token diisi) dan Web Push (kalau VAPID diisi).
// kind "paid" = pembayaran Midtrans lunas (siap diproses);
// kind "new"  = order dibuat tanpa pembayaran online (Midtrans belum aktif).
export async function notifyOrder(requestId: string, kind: "new" | "paid") {
  const waEnabled = !!process.env.FONNTE_TOKEN;
  const pushEnabled =
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY;
  if (!waEnabled && !pushEnabled) return;

  const order = await prisma.request.findUnique({
    where: { id: requestId },
    include: {
      store: { include: { sales: true } },
      createdBy: true,
      items: { include: { product: true } },
    },
  });
  if (!order || order.items.length === 0) return;

  const admins = await prisma.user.findMany({ where: { role: "ADMIN" } });
  const recipients = [
    ...(order.store.sales ? [order.store.sales] : []),
    ...admins,
  ];
  const phones = new Set<string>();
  const userIds = new Set<string>();
  for (const u of recipients) {
    if (u.phone) phones.add(u.phone);
    userIds.add(u.id);
  }

  const lines = order.items
    .slice(0, 5)
    .map((it) => `- ${it.product.name} x${it.qty}`);
  if (order.items.length > 5)
    lines.push(`- +${order.items.length - 5} barang lainnya`);

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const no = order.id.slice(-8).toUpperCase();
  const message = [
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

  const tasks: Promise<unknown>[] = [];
  if (waEnabled) {
    tasks.push(...[...phones].map((p) => sendWa(p, message)));
  }
  if (pushEnabled) {
    tasks.push(
      sendPushToUsers([...userIds], {
        title:
          kind === "paid"
            ? `Order #${no} sudah dibayar`
            : `Order restok baru #${no}`,
        body: `${order.store.name} — ${rupiah(order.total)} (${order.items.length} barang)`,
        url: "/order",
      }),
    );
  }
  await Promise.allSettled(tasks);
}
