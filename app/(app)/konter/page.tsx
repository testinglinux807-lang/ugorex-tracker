import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StageBadge } from "@/components/Badge";
import { VisitForm } from "@/components/VisitForm";
import { CreateOwnerForm } from "@/components/AccountForms";
import { KonterFilter } from "@/components/KonterFilter";
import { waLink } from "@/lib/wa";
import {
  Plus,
  MapPin,
  CheckCircle2,
  Circle,
  ClipboardPen,
  UserPlus,
  MessageCircle,
  Search,
  Trophy,
  X,
} from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

export default async function KonterPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  const q = ((await searchParams).q ?? "").trim();

  const scope = user.role === "SALES" ? { salesId: user.id } : {};

  const [stores, products, sales] = await Promise.all([
    prisma.store.findMany({
      where: scope,
      include: {
        ownerUser: true,
        prospects: {
          include: {
            product: true,
            logs: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.product.findMany({ orderBy: { name: "asc" } }),
    prisma.sale.findMany({
      where: user.role === "SALES" ? { store: { salesId: user.id } } : {},
      select: { storeId: true, productId: true, qty: true, total: true },
    }),
  ]);

  // Terlaris: total penjualan per konter, diberi peringkat 1-3 teratas
  const revenueByStore = new Map<string, number>();
  for (const s of sales) {
    revenueByStore.set(s.storeId, (revenueByStore.get(s.storeId) ?? 0) + s.total);
  }
  const rankByStore = new Map<string, number>();
  [...revenueByStore.entries()]
    .sort((a, b) => b[1] - a[1])
    .forEach(([storeId], i) => rankByStore.set(storeId, i + 1));

  // Filter pencarian (nama konter / area)
  const shown = q
    ? stores.filter((s) => {
        const hay = `${s.name} ${s.area ?? ""}`.toLowerCase();
        return hay.includes(q.toLowerCase());
      })
    : stores;

  const visited = shown.filter((s) => s.prospects.length > 0).length;

  // Sapaan menyesuaikan waktu (WIB)
  const hour = Number(
    new Date().toLocaleString("en-US", {
      hour: "2-digit",
      hour12: false,
      timeZone: "Asia/Jakarta",
    }),
  );
  const sapaWaktu =
    hour < 11
      ? "Selamat pagi"
      : hour < 15
        ? "Selamat siang"
        : hour < 19
          ? "Selamat sore"
          : "Selamat malam";

  // Stok menipis (sisa ≤ 10)
  const soldMap = new Map<string, number>();
  for (const s of sales) {
    if (!s.productId) continue;
    const k = `${s.storeId}__${s.productId}`;
    soldMap.set(k, (soldMap.get(k) ?? 0) + s.qty);
  }


  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">
            {user.role === "ADMIN" ? "Semua Konter" : "Konter Saya"}
          </h1>
          <p className="text-sm text-neutral-500">
            {q ? (
              <>
                {shown.length} hasil untuk &ldquo;{q}&rdquo;
              </>
            ) : (
              <>
                {shown.length} konter · {visited} sudah dikunjungi
              </>
            )}
          </p>
        </div>
      </div>

      {/* Search */}
      <form method="GET" action="/konter" className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Cari konter atau area…"
            className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <button
          type="submit"
          className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
        >
          <Search className="h-4 w-4" />
          Cari
        </button>
        {q && (
          <Link
            href="/konter"
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            <X className="h-4 w-4" />
            Reset
          </Link>
        )}
      </form>

      {stores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-neutral-500">Belum ada konter.</p>
          <Link
            href="/konter/baru"
            className="mt-3 inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
          >
            <Plus className="h-4 w-4" />
            Tambah konter pertama
          </Link>
        </div>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-8 text-center">
          <p className="text-neutral-500">
            Tidak ada konter cocok dengan &ldquo;{q}&rdquo;.
          </p>
          <Link
            href="/konter"
            className="mt-3 inline-flex items-center gap-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-50"
          >
            <X className="h-4 w-4" />
            Reset pencarian
          </Link>
        </div>
      ) : (
        <KonterFilter
          items={shown.map((s) => {
            const isVisited = s.prospects.length > 0;
            const lastLog = s.prospects
              .flatMap((p) => p.logs)
              .sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              )[0];
            // Barang menipis di konter ini → WA restok
            const lowItems = s.prospects
              .map((p) => ({
                product: p.product.name,
                remaining: p.stock - (soldMap.get(`${s.id}__${p.productId}`) ?? 0),
                stock: p.stock,
              }))
              .filter((x) => x.stock > 0 && x.remaining <= 10)
              .sort((a, b) => a.remaining - b.remaining);
            // Restok via WA — langsung ke kontak owner (wa.me/<nomor>)
            const sapaOwner = s.ownerName ? ` Bapak/Ibu ${s.ownerName}` : "";
            const waRestok =
              lowItems.length > 0
                ? waLink(
                    s.ownerPhone,
                    `Assalamualaikum, ${sapaWaktu}${sapaOwner}.\n` +
                      `Perkenalkan, saya ${user.name} dari Ugorex. Mohon maaf mengganggu waktunya.\n\n` +
                      `Saya ingin menginformasikan bahwa stok di ${s.name} sudah menipis dan mohon kesediaannya untuk restok:\n` +
                      `${lowItems
                        .map((it) => `• ${it.product} (sisa ${it.remaining})`)
                        .join("\n")}\n\n` +
                      `Terima kasih banyak atas kerja samanya.\n` +
                      `Wassalamualaikum.\n— ${user.name}, Ugorex`,
                  )
                : null;
            const revenue = revenueByStore.get(s.id) ?? 0;
            const rank = rankByStore.get(s.id);
            return {
              visited: isVisited,
              low: waRestok !== null,
              revenue,
              node: (
              <div
                key={s.id}
                className="flex flex-col rounded-xl border border-neutral-200 bg-white p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/konter/${s.id}`}
                      className="block truncate font-semibold hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="flex items-center gap-1 truncate text-sm text-neutral-500">
                      <MapPin className="h-3 w-3 shrink-0" /> {s.area ?? "—"}
                    </p>
                    {rank && rank <= 3 ? (
                      <p className="mt-1 flex items-center gap-1 text-xs font-semibold text-neutral-900">
                        <Trophy className="h-3.5 w-3.5 shrink-0 text-brand-dark" />
                        Top {rank} Terlaris · {rupiah(revenue)}
                      </p>
                    ) : revenue > 0 ? (
                      <p className="mt-1 text-xs text-neutral-500">
                        Terjual {rupiah(revenue)}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-neutral-400">
                        Belum ada penjualan
                      </p>
                    )}
                  </div>
                  {isVisited ? (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-900 bg-neutral-900 px-2 py-0.5 text-xs text-white">
                      <CheckCircle2 className="h-3 w-3" /> Dikunjungi
                    </span>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1 rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-500">
                      <Circle className="h-3 w-3" /> Belum
                    </span>
                  )}
                </div>

                {/* Prospek + sisa stok per barang */}
                {s.prospects.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.prospects.map((p) => {
                      const remaining =
                        p.stock - (soldMap.get(`${s.id}__${p.productId}`) ?? 0);
                      const low =
                        p.stock > 0 && remaining > 0 && remaining <= 10;
                      const empty = p.stock > 0 && remaining <= 0;
                      return (
                        <Link
                          key={p.id}
                          href={`/prospects/${p.id}`}
                          className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-2 py-1 text-xs hover:bg-neutral-50"
                        >
                          {p.product.name}
                          <StageBadge stage={p.stage} />
                          {p.stock > 0 && (
                            <span
                              className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                empty
                                  ? "bg-red-100 text-red-700"
                                  : low
                                    ? "bg-amber-100 text-amber-700"
                                    : "bg-neutral-100 text-neutral-500"
                              }`}
                            >
                              sisa {Math.max(0, remaining)}
                            </span>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}

                <p className="mt-2 text-xs text-neutral-400">
                  {lastLog
                    ? `Update terakhir ${new Date(
                        lastLog.createdAt,
                      ).toLocaleDateString("id-ID", {
                        day: "numeric",
                        month: "short",
                      })}`
                    : "Belum ada aktivitas"}
                </p>

                {/* Aksi: catat kunjungan + buat owner */}
                <div className="mt-auto space-y-2 pt-3">
                  {waRestok && (
                    <a
                      href={waRestok}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                    >
                      <MessageCircle className="h-4 w-4" />
                      Restok {lowItems.length} barang via WA
                    </a>
                  )}

                  <details className="rounded-lg border border-neutral-200">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700">
                      <ClipboardPen className="h-4 w-4" />
                      Catat Kunjungan / Funnel
                    </summary>
                    <div className="border-t border-neutral-100 p-3">
                      <VisitForm
                        storeId={s.id}
                        products={products.map((p) => ({
                          id: p.id,
                          name: p.name,
                        }))}
                      />
                    </div>
                  </details>

                  {s.ownerUser ? (
                    <p className="flex items-center gap-1.5 px-1 text-xs text-neutral-500">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Akun owner aktif
                    </p>
                  ) : (
                    <details className="rounded-lg border border-neutral-200">
                      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-700">
                        <UserPlus className="h-4 w-4" />
                        Buatkan Akun Owner
                      </summary>
                      <div className="border-t border-neutral-100 p-3">
                        <CreateOwnerForm storeId={s.id} />
                      </div>
                    </details>
                  )}
                </div>
              </div>
              ),
            };
          })}
        />
      )}
    </div>
  );
}
