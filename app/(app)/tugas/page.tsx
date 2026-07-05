import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { updateRequestStatus } from "@/app/actions/requests";
import { Paginated } from "@/components/Paginated";
import { SubmitButton } from "@/components/SubmitButton";
import { DeliveryReportForm } from "@/components/DeliveryReportForm";
import { TugasTabs } from "@/components/TugasTabs";
import { waLink } from "@/lib/wa";
import {
  ArrowRight,
  Truck,
  PackageCheck,
  CreditCard,
  MessageCircle,
  CheckCircle2,
  Store,
  type LucideIcon,
} from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

const fmtDate = (d: Date) =>
  new Date(d).toLocaleDateString("id-ID", { day: "numeric", month: "short" });

// Header sub-kelompok di dalam tab (state alur kerja)
function StateHeader({
  icon: Icon,
  title,
  n,
}: {
  icon: LucideIcon;
  title: string;
  n: number;
}) {
  return (
    <p className="mb-1 mt-4 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-neutral-400 first:mt-0">
      <Icon className="h-3.5 w-3.5" />
      {title} ({n})
    </p>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-200 bg-white p-10 text-center">
      <CheckCircle2 className="h-7 w-7 text-brand-dark" />
      <p className="text-sm text-neutral-500">{text}</p>
    </div>
  );
}

// To-do list kerjaan sales (admin: semua toko) gaya inbox: tab per jenis
// kerjaan + badge angka, dan tombol aksi langsung di tiap kartu sesuai
// state-nya — menandai dikirim/selesai otomatis memindahkan item ke
// state berikutnya tanpa pindah halaman.
export default async function TugasPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  const isAdmin = user.role === "ADMIN";
  const storeScope = isAdmin ? {} : { salesId: user.id };

  const [orders, freeRequests, tickets, stores] = await Promise.all([
    prisma.request.findMany({
      where: {
        items: { some: {} },
        status: { not: "COMPLETED" },
        store: storeScope,
      },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.request.findMany({
      where: { items: { none: {} }, status: "PENDING", store: storeScope },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.ticket.findMany({
      where: { status: { not: "CLOSED" }, store: storeScope },
      include: { store: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.store.findMany({
      where: storeScope,
      include: { _count: { select: { prospects: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const kirim = orders.filter(
    (o) => o.status === "PENDING" && o.paymentStatus === "PAID",
  );
  const diJalan = orders.filter((o) => o.status === "SHIPPED");
  const belumBayar = orders.filter(
    (o) => o.status === "PENDING" && o.paymentStatus !== "PAID",
  );
  const unvisited = stores.filter((s) => s._count.prospects === 0);

  const orderCount = kirim.length + diJalan.length + belumBayar.length;
  const totalTugas =
    orderCount + freeRequests.length + tickets.length + unvisited.length;

  const orderInfo = (o: (typeof orders)[number]) => (
    <Link href={`/order?focus=${o.id}`} className="min-w-0 flex-1 hover:underline">
      <span className="block truncate text-sm font-medium">{o.store.name}</span>
      <span className="block truncate text-xs text-neutral-400">
        #{o.id.slice(-8).toUpperCase()} · {rupiah(o.total)} · {fmtDate(o.createdAt)}
      </span>
    </Link>
  );

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tugas</h1>
        <p className="text-sm text-neutral-500">
          {totalTugas > 0
            ? `${totalTugas} tugas menunggu — ${isAdmin ? "semua toko" : "dari toko yang kamu pegang"}`
            : "Tidak ada tugas menunggu"}
        </p>
      </div>

      <TugasTabs
        tabs={[
          { key: "orderan", label: "Orderan Masuk", count: orderCount },
          { key: "request", label: "Request", count: freeRequests.length },
          { key: "keluhan", label: "Keluhan", count: tickets.length },
          { key: "kunjungan", label: "Kunjungan", count: unvisited.length },
        ]}
        sections={[
          {
            tab: "orderan",
            node:
              orderCount === 0 ? (
                <EmptyCard text="Tidak ada orderan yang perlu diproses." />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  {/* Alur: bayar → kirim → sampai. Aksi langsung di baris;
                      begitu ditandai, item pindah state berikutnya. */}
                  {kirim.length > 0 && (
                    <>
                      <StateHeader icon={Truck} title="Perlu Dikirim" n={kirim.length} />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={kirim.map((o) => (
                          <div
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                          >
                            {orderInfo(o)}
                            <form action={updateRequestStatus.bind(null, o.id, "SHIPPED")}>
                              <SubmitButton
                                pendingText="Memproses…"
                                overlayText="Menandai order dikirim…"
                                className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                              >
                                <Truck className="h-3.5 w-3.5" />
                                Tandai Dikirim
                              </SubmitButton>
                            </form>
                          </div>
                        ))}
                      />
                    </>
                  )}

                  {diJalan.length > 0 && (
                    <>
                      <StateHeader
                        icon={PackageCheck}
                        title="Di Jalan — Tunggu Report"
                        n={diJalan.length}
                      />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={diJalan.map((o) => (
                          <div
                            key={o.id}
                            className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                          >
                            {orderInfo(o)}
                            <DeliveryReportForm orderId={o.id} />
                          </div>
                        ))}
                      />
                    </>
                  )}

                  {belumBayar.length > 0 && (
                    <>
                      <StateHeader
                        icon={CreditCard}
                        title="Menunggu Pembayaran"
                        n={belumBayar.length}
                      />
                      <Paginated
                        perPage={5}
                        className="divide-y divide-neutral-100"
                        items={belumBayar.map((o) => {
                          const wa = waLink(
                            o.store.ownerPhone,
                            `Halo${o.store.ownerName ? " " + o.store.ownerName : ""}, orderan restok #${o.id.slice(-8).toUpperCase()} di ${o.store.name} (total ${rupiah(o.total)}) belum dibayar. Mohon diselesaikan ya, terima kasih.`,
                          );
                          return (
                            <div
                              key={o.id}
                              className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                            >
                              {orderInfo(o)}
                              {wa && (
                                <a
                                  href={wa}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                                >
                                  <MessageCircle className="h-3.5 w-3.5" />
                                  Ingatkan
                                </a>
                              )}
                            </div>
                          );
                        })}
                      />
                    </>
                  )}
                </div>
              ),
          },
          {
            tab: "request",
            node:
              freeRequests.length === 0 ? (
                <EmptyCard text="Tidak ada request yang menunggu dibalas." />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <Paginated
                    perPage={5}
                    className="divide-y divide-neutral-100"
                    items={freeRequests.map((r) => {
                      const wa = waLink(
                        r.store.ownerPhone,
                        `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal request "${r.subject}" dari ${r.store.name}.`,
                      );
                      return (
                        <div
                          key={r.id}
                          className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                        >
                          <Link href="/request" className="min-w-0 flex-1 hover:underline">
                            <span className="block truncate text-sm font-medium">
                              {r.subject} — {r.store.name}
                            </span>
                            <span className="block truncate text-xs text-neutral-400">
                              {r.message.slice(0, 60)} · {fmtDate(r.createdAt)}
                            </span>
                          </Link>
                          <div className="flex shrink-0 gap-1.5">
                            {wa && (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-green-700"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                                Chat
                              </a>
                            )}
                            <form action={updateRequestStatus.bind(null, r.id, "COMPLETED")}>
                              <SubmitButton
                                pendingText="Memproses…"
                                overlayText="Menandai request selesai…"
                                className="rounded-lg bg-neutral-900 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
                              >
                                Tandai Selesai
                              </SubmitButton>
                            </form>
                          </div>
                        </div>
                      );
                    })}
                  />
                </div>
              ),
          },
          {
            tab: "keluhan",
            node:
              tickets.length === 0 ? (
                <EmptyCard text="Tidak ada keluhan terbuka. Mantap!" />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <Paginated
                    perPage={5}
                    className="divide-y divide-neutral-100"
                    items={tickets.map((t) => (
                      <Link
                        key={t.id}
                        href={`/konter/${t.storeId}`}
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-neutral-50"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">
                            {t.subject} — {t.store.name}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            Status {t.status} · {fmtDate(t.createdAt)}
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
                      </Link>
                    ))}
                  />
                </div>
              ),
          },
          {
            tab: "kunjungan",
            node:
              unvisited.length === 0 ? (
                <EmptyCard text="Semua konter sudah dikunjungi." />
              ) : (
                <div className="rounded-2xl border border-neutral-200 bg-white p-5">
                  <Paginated
                    perPage={5}
                    className="divide-y divide-neutral-100"
                    items={unvisited.map((s) => (
                      <Link
                        key={s.id}
                        href="/konter"
                        className="flex items-center justify-between gap-3 py-2.5 hover:bg-neutral-50"
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                            <Store className="h-3.5 w-3.5 shrink-0 text-neutral-400" />
                            {s.name}
                          </span>
                          <span className="block truncate text-xs text-neutral-400">
                            {s.area ?? "Area belum diisi"} · belum ada prospek
                          </span>
                        </span>
                        <ArrowRight className="h-4 w-4 shrink-0 text-neutral-300" />
                      </Link>
                    ))}
                  />
                </div>
              ),
          },
        ]}
      />
    </div>
  );
}
