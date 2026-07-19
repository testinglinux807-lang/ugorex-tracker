import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { rupiah, rupiahShort } from "@/lib/format";
import { fmtDate, wibMonthStart } from "@/lib/date";
import { ArrowLeft, Percent, Wallet, Info } from "lucide-react";

// Riwayat penghasilan sales (fee bagi hasil / komisi affiliator):
// fee = persen (di-set admin di detail sales) × total tiap order restok
// LUNAS dari konter yang dia pegang. Order batal tidak dihitung.
export default async function PenghasilanPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "ADMIN") redirect("/sales");

  const pct = user.commissionPct;

  const [orders, payouts] = await Promise.all([
    prisma.request.findMany({
      where: {
        items: { some: {} },
        paymentStatus: "PAID",
        status: { not: "CANCELLED" },
        store: { salesId: user.id },
      },
      select: {
        id: true,
        total: true,
        paymentFee: true,
        createdAt: true,
        store: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 300,
    }),
    // Pencairan fee yang sudah dicatat admin — pengurang saldo
    prisma.commissionPayout.findMany({
      where: { salesId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Fee dihitung dari total barang (tanpa biaya admin pembayaran)
  const feeOf = (total: number) => Math.round((total * pct) / 100);

  const monthStart = wibMonthStart();
  const feeAll = orders.reduce((s, o) => s + feeOf(o.total), 0);
  const feeMonth = orders.reduce(
    (s, o) => (o.createdAt >= monthStart ? s + feeOf(o.total) : s),
    0,
  );
  // Saldo belum dicairkan — reset ke 0 tiap admin mencairkan penuh
  const paidOut = payouts.reduce((s, p) => s + p.amount, 0);
  const outstanding = feeAll - paidOut;

  // Kelompokkan per bulan (WIB) — orders sudah urut terbaru dulu
  const monthLabel = (d: Date) =>
    new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      month: "long",
      year: "numeric",
    }).format(d);
  const groups: { label: string; fee: number; items: typeof orders }[] = [];
  for (const o of orders) {
    const label = monthLabel(o.createdAt);
    const last = groups[groups.length - 1];
    const g =
      last?.label === label
        ? last
        : { label, fee: 0, items: [] as typeof orders };
    if (g !== last) groups.push(g);
    g.fee += feeOf(o.total);
    g.items.push(o);
  }

  return (
    <div className="space-y-4">
      <div>
        <Link
          href="/beranda"
          className="mb-2 inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Beranda
        </Link>
        <h1 className="text-2xl font-bold">Penghasilan Saya</h1>
        <p className="text-sm text-neutral-500">
          Fee bagi hasil dari order restok lunas konter yang kamu pegang
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl bg-neutral-900 p-4 text-white">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-400">
            <Wallet className="h-3.5 w-3.5" /> Belum dicairkan
          </p>
          <p
            className={`mt-1 truncate text-xl font-bold ${
              outstanding < 0 ? "text-red-400" : "text-brand"
            }`}
          >
            {rupiahShort(outstanding)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <Wallet className="h-3.5 w-3.5" /> Bulan ini
          </p>
          <p className="mt-1 truncate text-xl font-bold text-brand-dark">
            {rupiahShort(feeMonth)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <Wallet className="h-3.5 w-3.5" /> Total semua waktu
          </p>
          <p className="mt-1 truncate text-xl font-bold">
            {rupiahShort(feeAll)}
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="flex items-center gap-1.5 text-xs font-medium text-neutral-500">
            <Percent className="h-3.5 w-3.5" /> Persen bagi hasil
          </p>
          <p className="mt-1 text-xl font-bold">
            {pct > 0 ? `${pct}%` : "—"}
          </p>
        </div>
      </div>

      {pct === 0 && (
        <p className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-700">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Persen bagi hasilmu belum diatur admin — hubungi admin supaya fee
          dari order konter-mu mulai dihitung.
        </p>
      )}

      {/* Riwayat pencairan dari admin */}
      {payouts.length > 0 && (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
          <h2 className="mb-2 text-sm font-semibold text-neutral-500">
            Riwayat pencairan
          </h2>
          <ul className="divide-y divide-neutral-100">
            {payouts.map((p) => (
              <li key={p.id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{rupiah(p.amount)}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {fmtDate(p.createdAt)}
                    {p.note ? ` · ${p.note}` : ""}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-500">
                  dicairkan
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Riwayat per order, dikelompokkan per bulan */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          Riwayat fee per order
        </h2>
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-400">
            Belum ada order lunas dari konter-mu.
          </p>
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="flex items-center justify-between rounded-lg bg-neutral-50 px-3 py-1.5">
                  <span className="text-xs font-semibold text-neutral-600">
                    {g.label}
                  </span>
                  <span className="text-xs font-semibold text-brand-dark">
                    +{rupiah(g.fee)}
                  </span>
                </div>
                <ul className="divide-y divide-neutral-100 px-3">
                  {g.items.map((o) => (
                    <li key={o.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-neutral-900">
                          {o.store.name}
                        </p>
                        <p className="truncate text-xs text-neutral-400">
                          #{o.id.slice(-8).toUpperCase()} ·{" "}
                          {fmtDate(o.createdAt, {
                            day: "numeric",
                            month: "short",
                          })}{" "}
                          · order {rupiah(o.total)}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums text-brand-dark">
                        +{rupiah(feeOf(o.total))}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 border-t border-neutral-100 pt-2 text-xs text-neutral-400">
          Fee = {pct > 0 ? `${pct}%` : "persen bagi hasil"} × total barang tiap
          order lunas (tanpa biaya admin pembayaran). Menampilkan maks. 300
          order terakhir.
        </p>
      </section>
    </div>
  );
}
