import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackForm } from "@/components/FeedbackForm";
import { StaffFeedbackForm } from "@/components/StaffFeedbackForm";
import { StaffFeedbackReplyForm } from "@/components/StaffFeedbackReplyForm";
import { RequestReplyForm } from "@/components/RequestReplyForm";
import { SubmitButton } from "@/components/SubmitButton";
import { DataTabs } from "@/components/DataTabs";
import { updateRequestStatus } from "@/app/actions/requests";
import { updateStaffFeedbackStatus } from "@/app/actions/staff-feedback";
import {
  FEEDBACK_KIND,
  FEEDBACK_KIND_CLS,
  type FeedbackKind,
} from "@/lib/feedback-kind";
import { waLink } from "@/lib/wa";
import {
  MessageCircle,
  ShoppingBag,
  Inbox,
  ArrowRight,
  MessageSquareReply,
  ListTodo,
  Store,
} from "lucide-react";

const PENDING_CLS = "border-amber-300 bg-amber-50 text-amber-700";
const DONE_CLS = "border-neutral-900 bg-neutral-900 text-white";

function KindBadge({ kind }: { kind: FeedbackKind }) {
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${FEEDBACK_KIND_CLS[kind]}`}
    >
      {FEEDBACK_KIND[kind]}
    </span>
  );
}

function StatusBadge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}

function Balasan({
  response,
  by,
  at,
}: {
  response: string;
  by: string | null;
  at: Date | null;
}) {
  return (
    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
      <p className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
        <MessageSquareReply className="h-3 w-3" />
        Balasan · {by ?? "-"}
        {at &&
          ` · ${at.toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
          })}`}
      </p>
      <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-800">
        {response}
      </p>
    </div>
  );
}

const tanggal = (d: Date) =>
  d.toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

// Menu Feedback sisi staf. Dua sumber, dua tab:
// 1. "Dari Konter" — keluhan/saran/ajukan barang milik konter. Masuk dari
//    app owner (menu Feedback) atau dicatat sales di sini atas nama konter.
//    Keluhan jadi Ticket (inbox Keluhan di /tugas), saran & ajukan barang
//    jadi Request bebas yang bisa dibalas di sini.
// 2. "Dari Sales" / "Ke Admin" — StaffFeedback: sales ngomong soal
//    kerjaannya sendiri ke admin, tanpa konter.
export default async function FeedbackStafPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  // Owner punya pintunya sendiri (satu halaman dengan rating sales)
  if (user.role === "OWNER") redirect("/feedback");
  if (user.role === "GUDANG") redirect("/gudang");

  const isSales = user.role === "SALES";
  const storeScope = isSales ? { store: { salesId: user.id } } : {};

  const [requests, tickets, staffFeedbacks, salesStores, admin] =
    await Promise.all([
      // Request bebas saja — orderan restok (ber-item) ada di menu Order
      prisma.request.findMany({
        where: { items: { none: {} }, ...storeScope },
        include: {
          store: { select: { id: true, name: true, ownerName: true, ownerPhone: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      // Keluhan konter — read-only di sini, penanganannya di inbox Keluhan
      // (/tugas) yang sudah ada.
      prisma.ticket.findMany({
        where: storeScope,
        include: {
          store: { select: { id: true, name: true } },
          createdBy: { select: { name: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      prisma.staffFeedback.findMany({
        where: isSales ? { createdById: user.id } : {},
        include: { createdBy: { select: { name: true } } },
        orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      }),
      // Konter yang dipegang sales — buat form catat feedback atas nama konter
      isSales
        ? prisma.store.findMany({
            where: { salesId: user.id },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          })
        : Promise.resolve([]),
      // Nomor WA admin — tombol "Chat Admin" di kartu request (khusus sales)
      isSales
        ? prisma.user.findFirst({
            where: { role: "ADMIN" },
            select: { phone: true },
            orderBy: { createdAt: "asc" },
          })
        : Promise.resolve(null),
    ]);

  // ===== Tab 1: dari konter =====
  const requestCard = (r: (typeof requests)[number]) => {
    const saran = r.subject.startsWith("[Saran]");
    const kind: FeedbackKind = saran ? "SARAN" : "BARANG";
    const subject = saran ? r.subject.replace(/^\[Saran\]\s*/, "") : r.subject;
    const wa = waLink(
      r.store.ownerPhone,
      `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal "${subject}" dari ${r.store.name}.`,
    );
    // Sales bisa lempar/tanya ke admin soal feedback ini via WA
    const waAdmin = isSales
      ? waLink(
          admin?.phone,
          `Halo admin, soal "${subject}" dari ${r.store.name} (${r.createdBy?.name ?? "-"}): ${r.message}`,
        )
      : null;
    return (
      <li key={r.id} className="rounded-lg border border-neutral-200 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-medium">{subject}</p>
          <StatusBadge
            label={r.status === "COMPLETED" ? "Selesai" : "Menunggu"}
            cls={r.status === "COMPLETED" ? DONE_CLS : PENDING_CLS}
          />
        </div>
        <p className="mt-1 text-sm text-neutral-600">{r.message}</p>
        {r.response && (
          <Balasan
            response={r.response}
            by={r.respondedBy}
            at={r.respondedAt}
          />
        )}
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
          <KindBadge kind={kind} />
          <Link
            href={`/konter/${r.store.id}`}
            className="font-medium text-neutral-500 hover:underline"
          >
            {r.store.name}
          </Link>
          · {r.createdBy?.name ?? "-"} · {tanggal(r.createdAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <RequestReplyForm requestId={r.id} hasResponse={!!r.response} />
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Hubungi Owner
            </a>
          )}
          {waAdmin && (
            <a
              href={waAdmin}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-neutral-900 bg-white px-2 py-1 text-xs font-semibold text-neutral-900 hover:bg-neutral-100"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Chat Admin
            </a>
          )}
          {r.status !== "COMPLETED" ? (
            <form action={updateRequestStatus.bind(null, r.id, "COMPLETED")}>
              <SubmitButton
                pendingText="Memproses…"
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                Tandai selesai
              </SubmitButton>
            </form>
          ) : (
            <form action={updateRequestStatus.bind(null, r.id, "PENDING")}>
              <SubmitButton
                pendingText="Memproses…"
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
              >
                Buka lagi
              </SubmitButton>
            </form>
          )}
        </div>
      </li>
    );
  };

  const ticketCard = (t: (typeof tickets)[number]) => (
    <li key={t.id} className="rounded-lg border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium">{t.subject}</p>
        <StatusBadge
          label={
            t.status === "CLOSED"
              ? "Selesai"
              : t.status === "IN_PROGRESS"
                ? "Diproses"
                : "Terbuka"
          }
          cls={
            t.status === "CLOSED"
              ? DONE_CLS
              : t.status === "IN_PROGRESS"
                ? "border-brand-dark bg-brand/20 text-neutral-900"
                : PENDING_CLS
          }
        />
      </div>
      <p className="mt-1 text-sm text-neutral-600">{t.message}</p>
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
        <KindBadge kind="KELUHAN" />
        <Link
          href={`/konter/${t.store.id}`}
          className="font-medium text-neutral-500 hover:underline"
        >
          {t.store.name}
        </Link>
        · {t.createdBy?.name ?? "-"} · {tanggal(t.createdAt)}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Link
          href="/tugas"
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          <ListTodo className="h-3.5 w-3.5" />
          Tangani di Tugas › Keluhan
        </Link>
        <Link
          href={`/konter/${t.store.id}`}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
        >
          <Store className="h-3.5 w-3.5" />
          Detail konter
        </Link>
      </div>
    </li>
  );

  // Gabung keluhan + saran/ajukan barang jadi satu daftar, terbaru duluan
  const konterItems: { at: number; node: ReactNode }[] = [
    ...requests.map((r) => ({
      at: r.createdAt.getTime(),
      node: requestCard(r),
    })),
    ...tickets.map((t) => ({ at: t.createdAt.getTime(), node: ticketCard(t) })),
  ].sort((a, b) => b.at - a.at);

  // ===== Tab 2: sales ↔ admin =====
  const staffCard = (f: (typeof staffFeedbacks)[number]) => (
    <li key={f.id} className="rounded-lg border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 font-medium">{f.subject}</p>
        <StatusBadge
          label={f.status === "COMPLETED" ? "Selesai" : "Menunggu"}
          cls={f.status === "COMPLETED" ? DONE_CLS : PENDING_CLS}
        />
      </div>
      <p className="mt-1 text-sm text-neutral-600">{f.message}</p>
      {f.response && (
        <Balasan response={f.response} by={f.respondedBy} at={f.respondedAt} />
      )}
      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
        <KindBadge kind={(f.kind as FeedbackKind) ?? "SARAN"} />
        {f.createdBy.name} · {tanggal(f.createdAt)}
      </p>
      {!isSales && (
        <div className="mt-2 flex flex-wrap items-start gap-2">
          <StaffFeedbackReplyForm feedbackId={f.id} hasResponse={!!f.response} />
          {f.status !== "COMPLETED" ? (
            <form action={updateStaffFeedbackStatus.bind(null, f.id, "COMPLETED")}>
              <SubmitButton
                pendingText="Memproses…"
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                Tandai selesai
              </SubmitButton>
            </form>
          ) : (
            <form action={updateStaffFeedbackStatus.bind(null, f.id, "PENDING")}>
              <SubmitButton
                pendingText="Memproses…"
                className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
              >
                Buka lagi
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </li>
  );

  const listBox = (
    title: string,
    count: number,
    empty: string,
    children: ReactNode,
  ) => (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-neutral-500" />
        <h2 className="font-semibold">
          {title} ({count})
        </h2>
      </div>
      {count === 0 ? (
        <p className="text-sm text-neutral-400">{empty}</p>
      ) : (
        <ul className="space-y-3">{children}</ul>
      )}
    </div>
  );

  const konterSection = listBox(
    "Feedback Konter",
    konterItems.length,
    "Belum ada feedback dari konter.",
    konterItems.map((it) => it.node),
  );
  const staffSection = listBox(
    isSales ? "Feedback Saya" : "Feedback Sales",
    staffFeedbacks.length,
    isSales
      ? "Belum ada feedback yang kamu kirim ke admin."
      : "Belum ada feedback dari sales.",
    staffFeedbacks.map(staffCard),
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="text-sm text-neutral-500">
          {isSales
            ? "Keluhan, saran & pengajuan barang - dari konter yang kamu pegang, dan dari kamu ke admin"
            : "Keluhan, saran & pengajuan barang dari konter dan dari sales"}
        </p>
      </div>

      <Link
        href="/order"
        className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-sm hover:border-neutral-400"
      >
        <span className="flex items-center gap-2 font-medium">
          <ShoppingBag className="h-4 w-4 text-neutral-500" />
          Orderan restok toko ada di menu Order
        </span>
        <ArrowRight className="h-4 w-4 text-neutral-400" />
      </Link>

      <DataTabs
        alwaysTabs
        gridClassName="lg:grid-cols-1"
        tabs={[
          { key: "konter", label: "Dari Konter", count: konterItems.length },
          {
            key: "staf",
            label: isSales ? "Ke Admin" : "Dari Sales",
            count: staffFeedbacks.length,
          },
        ]}
        sections={[
          {
            tab: "konter",
            node:
              salesStores.length > 0 ? (
                <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                  <FeedbackForm stores={salesStores} />
                  {konterSection}
                </div>
              ) : (
                konterSection
              ),
          },
          {
            tab: "staf",
            node: isSales ? (
              <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
                <StaffFeedbackForm />
                {staffSection}
              </div>
            ) : (
              staffSection
            ),
          },
        ]}
      />
    </div>
  );
}
