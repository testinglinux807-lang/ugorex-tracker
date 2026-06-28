import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { RequestForm } from "@/components/RequestForm";
import { updateRequestStatus } from "@/app/actions/requests";
import { waLink } from "@/lib/wa";
import { MessageCircle } from "lucide-react";

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

  // Scope: owner -> tokonya, sales -> toko yg dia pegang, admin -> semua
  const where =
    user.role === "OWNER"
      ? { storeId: user.ownedStore?.id ?? "__none__" }
      : user.role === "SALES"
        ? { store: { salesId: user.id } }
        : {};

  const requests = await prisma.request.findMany({
    where,
    include: { store: true, createdBy: true },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  const canRespond = user.role !== "OWNER";

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Request</h1>
        <p className="text-sm text-neutral-500">
          {user.role === "OWNER"
            ? "Ajukan kebutuhan ke sales/admin"
            : user.role === "SALES"
              ? "Permintaan dari toko yang kamu pegang"
              : "Semua permintaan dari toko"}
        </p>
      </div>

      {user.role === "OWNER" && !user.ownedStore ? (
        <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
          Akun ini belum terhubung ke toko.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {user.role === "OWNER" && <RequestForm />}

          <div className="rounded-2xl border border-neutral-200 bg-white p-5">
            <h2 className="mb-3 font-semibold">Daftar Request ({requests.length})</h2>
            {requests.length === 0 ? (
              <p className="text-sm text-neutral-400">Belum ada request.</p>
            ) : (
              <ul className="space-y-3">
                {requests.map((r) => {
                  const wa = waLink(
                    r.store.ownerPhone,
                    `Halo${r.store.ownerName ? " " + r.store.ownerName : ""}, soal request "${r.subject}" dari ${r.store.name}.`,
                  );
                  return (
                    <li
                      key={r.id}
                      className="rounded-lg border border-neutral-200 p-3"
                    >
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
                        {user.role !== "OWNER" ? `${r.store.name} · ` : ""}
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
                          {r.status !== "COMPLETED" ? (
                            <form
                              action={updateRequestStatus.bind(null, r.id, "COMPLETED")}
                            >
                              <button className="rounded-lg border border-neutral-900 bg-neutral-900 px-2 py-1 text-xs text-white hover:bg-neutral-800">
                                Tandai selesai
                              </button>
                            </form>
                          ) : (
                            <form
                              action={updateRequestStatus.bind(null, r.id, "PENDING")}
                            >
                              <button className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100">
                                Buka lagi
                              </button>
                            </form>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
