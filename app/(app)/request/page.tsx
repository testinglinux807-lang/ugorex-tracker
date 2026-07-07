import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { FreeRequestForm } from "@/components/RequestForm";
import { SubmitButton } from "@/components/SubmitButton";
import { updateRequestStatus } from "@/app/actions/requests";
import { waLink } from "@/lib/wa";
import { MessageCircle, ShoppingBag, Inbox, ArrowRight } from "lucide-react";

const STATUS_LABEL: Record<string, string> = {
  PENDING: "Menunggu",
  COMPLETED: "Selesai",
};
const STATUS_CLS: Record<string, string> = {
  PENDING: "border-amber-300 bg-amber-50 text-amber-700",
  COMPLETED: "border-neutral-900 bg-neutral-900 text-white",
};

export default async function RequestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const isOwner = user.role === "OWNER";

  // Halaman ini khusus request teks bebas — orderan restok ada di menu Order
  const requests = await prisma.request.findMany({
    where: {
      items: { none: {} },
      ...(isOwner
        ? { storeId: user.ownedStore?.id ?? "__none__" }
        : user.role === "SALES"
          ? { store: { salesId: user.id } }
          : {}),
    },
    include: { store: true, createdBy: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const canRespond = !isOwner;

  // Nomor WA admin — buat tombol "Chat Admin" di kartu request (khusus sales).
  const admin =
    user.role === "SALES"
      ? await prisma.user.findFirst({
          where: { role: "ADMIN" },
          select: { phone: true },
          orderBy: { createdAt: "asc" },
        })
      : null;

  const card = (r: (typeof requests)[number]) => {
    const wa = waLink(
      r.store.ownerPhone,
      `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal request "${r.subject}" dari ${r.store.name}.`,
    );
    // Sales bisa lempar/tanya ke admin soal request ini via WA.
    const waAdmin =
      user.role === "SALES"
        ? waLink(
            admin?.phone,
            `Halo admin, soal request "${r.subject}" dari ${r.store.name} (${r.createdBy?.name ?? "-"}): ${r.message}`,
          )
        : null;
    return (
      <li key={r.id} className="rounded-lg border border-neutral-200 p-3">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 font-medium">{r.subject}</p>
          <span
            className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium ${
              STATUS_CLS[r.status] ?? STATUS_CLS.PENDING
            }`}
          >
            {STATUS_LABEL[r.status] ?? r.status}
          </span>
        </div>
        <p className="mt-1 text-sm text-neutral-600">{r.message}</p>
        <p className="mt-1 text-xs text-neutral-400">
          {canRespond ? `${r.store.name} · ` : ""}
          {r.createdBy?.name ?? "—"} ·{" "}
          {new Date(r.createdAt).toLocaleDateString("id-ID", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })}
        </p>
        {canRespond && (
          <div className="mt-2 flex flex-wrap gap-2">
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
        )}
      </li>
    );
  };

  const list = (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-neutral-500" />
        <h2 className="font-semibold">Daftar Request ({requests.length})</h2>
      </div>
      {requests.length === 0 ? (
        <p className="text-sm text-neutral-400">Belum ada request.</p>
      ) : (
        <ul className="space-y-3">{requests.map(card)}</ul>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Request</h1>
        <p className="text-sm text-neutral-500">
          {isOwner
            ? "Ajukan kebutuhan ke sales/admin (restok barang lewat menu Order)"
            : user.role === "SALES"
              ? "Permintaan dari toko yang kamu pegang"
              : "Semua permintaan dari toko"}
        </p>
      </div>

      <Link
        href="/order"
        className="flex items-center justify-between rounded-2xl border border-neutral-200 bg-white p-4 text-sm hover:border-neutral-400"
      >
        <span className="flex items-center gap-2 font-medium">
          <ShoppingBag className="h-4 w-4 text-neutral-500" />
          {isOwner
            ? "Mau order restok barang? Lewat menu Order"
            : "Orderan restok toko ada di menu Order"}
        </span>
        <ArrowRight className="h-4 w-4 text-neutral-400" />
      </Link>

      {isOwner && !user.ownedStore ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Akun ini belum terhubung ke toko.
        </div>
      ) : isOwner ? (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          <FreeRequestForm />
          {list}
        </div>
      ) : (
        list
      )}
    </div>
  );
}
