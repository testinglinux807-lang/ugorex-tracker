import "server-only";
import { prisma } from "./prisma";
import { waNumber } from "./wa";
import { sendPushToUsers } from "./push";
import { PAYMENT_METHOD_LABEL } from "./payment-fee";

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

// Kabari sales soal tugas baru dari admin — riwayat in-app (lonceng)
// selalu dicatat, WA & Web Push menyusul kalau dikonfigurasi. Dipanggil
// dari createTask (app/actions/tasks.ts); tidak pernah melempar error.
export async function notifyNewTask(input: {
  salesIds: string[];
  title: string;
  note: string | null;
  priority: string; // HIGH | NORMAL
  dueDate: Date | null;
  storeId: string | null;
}) {
  const waEnabled = !!process.env.FONNTE_TOKEN;
  const pushEnabled =
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY;

  const [salesUsers, store] = await Promise.all([
    prisma.user.findMany({
      where: { id: { in: input.salesIds } },
      select: { id: true, phone: true },
    }),
    input.storeId
      ? prisma.store.findUnique({
          where: { id: input.storeId },
          select: { name: true },
        })
      : null,
  ]);
  if (salesUsers.length === 0) return;

  const penting = input.priority === "HIGH";
  const due = input.dueDate
    ? new Date(input.dueDate).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      })
    : null;

  const push = {
    title: penting
      ? `Tugas PENTING baru: ${input.title}`
      : `Tugas baru: ${input.title}`,
    body:
      [store?.name, due ? `tenggat ${due}` : null, input.note]
        .filter(Boolean)
        .join(" · ") || "Cek detailnya di menu Tugas",
    url: "/tugas",
  };

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const message = [
    penting ? "TUGAS PENTING dari Admin" : "Tugas Baru dari Admin",
    ``,
    input.title,
    ...(input.note ? [input.note] : []),
    ``,
    ...(store ? [`Konter: ${store.name}`] : []),
    ...(due ? [`Tenggat: ${due}`] : []),
    ...(appUrl ? [``, `Kerjakan: ${appUrl}/tugas`] : []),
  ].join("\n");

  const jobs: Promise<unknown>[] = [
    prisma.notification.createMany({
      data: salesUsers.map((u) => ({
        userId: u.id,
        title: push.title,
        body: push.body,
        url: push.url,
      })),
    }),
  ];
  if (waEnabled) {
    jobs.push(
      ...salesUsers.filter((u) => u.phone).map((u) => sendWa(u.phone, message)),
    );
  }
  if (pushEnabled) {
    jobs.push(
      sendPushToUsers(
        salesUsers.map((u) => u.id),
        push,
      ),
    );
  }
  await Promise.allSettled(jobs);
}

// "Rolling restock": begitu sisa stok sebuah model di konter jadi 0 (habis
// terjual di POS), sales pemegang konter otomatis dapat TUGAS follow-up +
// notif (lonceng/WA/push) — tawarkan lanjut model yang laku itu sekalian
// rolling model baru untuk isi slot kosong, biar slot konter selalu terisi.
// Dipanggil via after() dari createSale (app/actions/pos.ts).
export async function notifyStockEmpty(storeId: string, productIds: string[]) {
  if (productIds.length === 0) return;
  const store = await prisma.store.findUnique({
    where: { id: storeId },
    include: { sales: true },
  });
  if (!store) return;

  // Penerima: sales pemegang konter; konter tanpa sales → admin pertama
  const assignee =
    store.sales ??
    (await prisma.user.findFirst({
      where: { role: "ADMIN" },
      orderBy: { createdAt: "asc" },
    }));
  if (!assignee) return;

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, code: true },
  });

  const waEnabled = !!process.env.FONNTE_TOKEN;
  const pushEnabled =
    !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY;
  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const besok = new Date(Date.now() + 24 * 60 * 60 * 1000);

  for (const p of products) {
    const title = `Rolling restock: ${p.name} habis di ${store.name}`;
    // Anti-dobel: selama tugas serupa masih PENDING, jangan bikin lagi
    // (stok bisa nol berkali-kali kalau owner input beberapa transaksi)
    const exists = await prisma.task.findFirst({
      where: { storeId, status: "PENDING", title },
      select: { id: true },
    });
    if (exists) continue;

    const note = `Model ini LAKU sampai stoknya 0${p.code ? ` (kode ${p.code})` : ""}. Follow up owner: tawarkan lanjut model yang sama + rolling model baru untuk isi slot kosong. Tindakan: chat/WA atau datang langsung.`;

    await prisma.task.create({
      data: {
        title,
        note,
        priority: "HIGH",
        dueDate: besok,
        assignedToId: assignee.id,
        storeId,
      },
    });

    const push = {
      title: `Stok habis - rolling restock: ${p.name}`,
      body: `${store.name} — model laku, follow up owner untuk lanjut + rolling model baru`,
      url: "/tugas",
    };
    const message = [
      `STOK HABIS - Rolling Restock`,
      ``,
      `${p.name}${p.code ? ` (kode ${p.code})` : ""} di ${store.name} sisa 0 — model ini laku.`,
      ``,
      `Follow up owner:`,
      `- Tawarkan lanjut model yang sama`,
      `- Rolling model baru untuk isi slot kosong`,
      ``,
      `Tindakan: chat/WA owner atau datang langsung.`,
      ...(store.ownerPhone ? [`WA owner: ${store.ownerPhone}`] : []),
      ...(appUrl ? [``, `Kerjakan: ${appUrl}/tugas`] : []),
    ].join("\n");

    const jobs: Promise<unknown>[] = [
      prisma.notification.create({
        data: {
          userId: assignee.id,
          title: push.title,
          body: push.body,
          url: push.url,
        },
      }),
    ];
    if (waEnabled && assignee.phone) jobs.push(sendWa(assignee.phone, message));
    if (pushEnabled) jobs.push(sendPushToUsers([assignee.id], push));
    await Promise.allSettled(jobs);
  }
}

// Kabari pembuat request bebas bahwa request-nya dibalas sales/admin —
// dipanggil dari respondRequest (app/actions/requests.ts) via after().
export async function notifyRequestReply(requestId: string) {
  const req = await prisma.request.findUnique({
    where: { id: requestId },
    include: { store: true, createdBy: true },
  });
  if (!req || !req.response || !req.createdBy) return;

  const push = {
    title: `Request "${req.subject}" dibalas`,
    body: req.response.length > 120 ? `${req.response.slice(0, 117)}…` : req.response,
    url: "/request",
  };

  const appUrl = process.env.APP_URL?.replace(/\/$/, "");
  const message = [
    `Request "${req.subject}" sudah dibalas`,
    ``,
    `Balasan dari ${req.respondedBy ?? "tim Ugorex"}:`,
    req.response,
    ``,
    `Konter: ${req.store.name}`,
    ...(appUrl ? [``, `Lihat: ${appUrl}/request`] : []),
  ].join("\n");

  const jobs: Promise<unknown>[] = [
    prisma.notification.create({
      data: {
        userId: req.createdBy.id,
        title: push.title,
        body: push.body,
        url: push.url,
      },
    }),
  ];
  if (process.env.FONNTE_TOKEN && req.createdBy.phone) {
    jobs.push(sendWa(req.createdBy.phone, message));
  }
  if (
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY &&
    process.env.VAPID_PRIVATE_KEY
  ) {
    jobs.push(sendPushToUsers([req.createdBy.id], push));
  }
  await Promise.allSettled(jobs);
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
  const methodLabel = order.paymentMethod
    ? (PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod)
    : null;

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
          ...(methodLabel ? [`Metode: ${methodLabel}`] : []),
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
          body: `${order.store.name} — ${rupiah(order.total)}${methodLabel ? ` · ${methodLabel}` : ""} (${order.items.length} barang)`,
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
