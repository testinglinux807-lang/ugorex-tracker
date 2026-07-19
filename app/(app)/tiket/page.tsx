import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { TicketForm } from "@/components/TicketForm";
import { updateTicketStatus } from "@/app/actions/tickets";
import { waLink } from "@/lib/wa";
import { MessageCircle } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Terbuka",
  IN_PROGRESS: "Diproses",
  CLOSED: "Selesai",
};
const STATUS_CLS: Record<string, string> = {
  OPEN: "border-neutral-300 bg-white text-neutral-700",
  IN_PROGRESS: "border-brand bg-brand text-neutral-900",
  CLOSED: "border-neutral-900 bg-neutral-900 text-white",
};

export default async function TiketPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "SALES") redirect("/prospects");
  // Owner sekarang lewat satu pintu Feedback (keluhan/saran/request)
  if (user.role === "OWNER") redirect("/feedback");
  if (user.role === "OWNER" && !user.ownedStore) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
        Akun ini belum terhubung ke toko.
      </div>
    );
  }

  const tickets = await prisma.ticket.findMany({
    where: user.role === "OWNER" ? { storeId: user.ownedStore!.id } : {},
    include: { store: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Tiket Keluhan</h1>
        <p className="text-sm text-neutral-500">
          {user.role === "OWNER"
            ? "Laporkan keluhan terkait barang/layanan"
            : "Semua tiket keluhan dari toko"}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {user.role === "OWNER" && <TicketForm />}

        <div className="rounded-2xl border border-neutral-200 bg-white p-5">
          <h2 className="mb-3 font-semibold">Daftar Tiket ({tickets.length})</h2>
          {tickets.length === 0 ? (
            <p className="text-sm text-neutral-400">Belum ada tiket.</p>
          ) : (
            <ul className="space-y-3">
              {tickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-lg border border-neutral-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium">{t.subject}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
                        STATUS_CLS[t.status] ?? STATUS_CLS.OPEN
                      }`}
                    >
                      {STATUS_LABEL[t.status] ?? t.status}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-neutral-600">{t.message}</p>
                  <p className="mt-1 text-xs text-neutral-400">
                    {user.role !== "OWNER" ? `${t.store.name} · ` : ""}
                    {new Date(t.createdAt).toLocaleDateString("id-ID", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>

                  {/* Aksi ubah status */}
                  <div className="mt-2 flex flex-wrap gap-2">
                    {user.role !== "OWNER" &&
                      (() => {
                        const link = waLink(
                          t.store.ownerPhone,
                          `Halo${t.store.ownerName ? " " + t.store.ownerName : ""}, ini admin Ugorex. Terkait keluhan "${t.subject}" untuk ${t.store.name}. Boleh dibantu jelaskan lebih lanjut?`,
                        );
                        if (!link) return null;
                        return (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Balas via WhatsApp
                          </a>
                        );
                      })()}
                    {t.status !== "IN_PROGRESS" && (
                      <form action={updateTicketStatus.bind(null, t.id, "IN_PROGRESS")}>
                        <button className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                          Tandai diproses
                        </button>
                      </form>
                    )}
                    {t.status !== "CLOSED" && (
                      <form action={updateTicketStatus.bind(null, t.id, "CLOSED")}>
                        <button className="rounded-lg border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800">
                          Tandai selesai
                        </button>
                      </form>
                    )}
                    {t.status === "CLOSED" && (
                      <form action={updateTicketStatus.bind(null, t.id, "OPEN")}>
                        <button className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                          Buka lagi
                        </button>
                      </form>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
