import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FeedbackForm } from "@/components/FeedbackForm";
import {
  ShoppingBag,
  ArrowRight,
  Inbox,
  MessageSquareReply,
} from "lucide-react";

// Menu Feedback owner — satu pintu untuk keluhan (tiket), saran, dan
// request barang (request bebas). Sisi sales/admin tidak berubah: keluhan
// tetap masuk inbox Keluhan (/tugas & detail konter), saran/request masuk
// /request.
export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "OWNER") redirect("/request");
  if (!user.ownedStore) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Akun ini belum terhubung ke toko.
      </div>
    );
  }

  const storeId = user.ownedStore.id;
  const [tickets, requests] = await Promise.all([
    prisma.ticket.findMany({
      where: { storeId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.request.findMany({
      where: { storeId, items: { none: {} } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Gabungkan tiket + request jadi satu riwayat, terbaru duluan
  type Item = {
    id: string;
    kind: "Keluhan" | "Saran" | "Request barang";
    subject: string;
    message: string;
    statusLabel: string;
    statusCls: string;
    response: string | null;
    respondedBy: string | null;
    respondedAt: Date | null;
    createdAt: Date;
  };
  const items: Item[] = [
    ...tickets.map(
      (t): Item => ({
        id: `t-${t.id}`,
        kind: "Keluhan",
        subject: t.subject,
        message: t.message,
        statusLabel:
          t.status === "CLOSED"
            ? "Selesai"
            : t.status === "IN_PROGRESS"
              ? "Diproses"
              : "Terbuka",
        statusCls:
          t.status === "CLOSED"
            ? "border-neutral-900 bg-neutral-900 text-white"
            : t.status === "IN_PROGRESS"
              ? "border-brand bg-brand text-neutral-900"
              : "border-neutral-300 bg-white text-neutral-700",
        response: null,
        respondedBy: null,
        respondedAt: null,
        createdAt: t.createdAt,
      }),
    ),
    ...requests.map((r): Item => {
      const saran = r.subject.startsWith("[Saran]");
      return {
        id: `r-${r.id}`,
        kind: saran ? "Saran" : "Request barang",
        subject: saran ? r.subject.replace(/^\[Saran\]\s*/, "") : r.subject,
        message: r.message,
        statusLabel: r.status === "COMPLETED" ? "Selesai" : "Menunggu",
        statusCls:
          r.status === "COMPLETED"
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-amber-300 bg-amber-50 text-amber-700",
        response: r.response,
        respondedBy: r.respondedBy,
        respondedAt: r.respondedAt,
        createdAt: r.createdAt,
      };
    }),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const KIND_CLS: Record<Item["kind"], string> = {
    Keluhan: "border-red-200 bg-red-50 text-red-600",
    Saran: "border-neutral-300 bg-neutral-100 text-neutral-600",
    "Request barang": "border-brand-dark bg-brand/20 text-neutral-900",
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Feedback</h1>
        <p className="text-sm text-neutral-500">
          Keluhan, saran, dan request barang ke sales/admin
        </p>
      </div>

      <Link
        href="/order"
        className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-sm hover:border-neutral-400"
      >
        <span className="flex items-center gap-2 font-medium">
          <ShoppingBag className="h-4 w-4 text-neutral-500" />
          Mau order restok barang? Lewat menu Order
        </span>
        <ArrowRight className="h-4 w-4 text-neutral-400" />
      </Link>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
        <FeedbackForm />

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <div className="mb-3 flex items-center gap-2">
            <Inbox className="h-4 w-4 text-neutral-500" />
            <h2 className="font-semibold">Riwayat Feedback ({items.length})</h2>
          </div>
          {items.length === 0 ? (
            <p className="text-sm text-neutral-400">Belum ada feedback.</p>
          ) : (
            <ul className="space-y-3">
              {items.map((it) => (
                <li
                  key={it.id}
                  className="rounded-lg border border-neutral-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 font-medium">{it.subject}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${it.statusCls}`}
                    >
                      {it.statusLabel}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{it.message}</p>
                  {it.response && (
                    <div className="mt-2 rounded-lg border border-neutral-200 bg-neutral-50 p-2.5">
                      <p className="flex items-center gap-1 text-[11px] font-semibold text-neutral-500">
                        <MessageSquareReply className="h-3 w-3" />
                        Balasan · {it.respondedBy ?? "-"}
                        {it.respondedAt &&
                          ` · ${it.respondedAt.toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                          })}`}
                      </p>
                      <p className="mt-0.5 whitespace-pre-line text-sm text-neutral-800">
                        {it.response}
                      </p>
                    </div>
                  )}
                  <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${KIND_CLS[it.kind]}`}
                    >
                      {it.kind}
                    </span>
                    {it.createdAt.toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
