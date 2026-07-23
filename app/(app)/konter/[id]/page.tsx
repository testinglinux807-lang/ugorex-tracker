import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { StageBadge } from "@/components/Badge";
import { TopProductsChart } from "@/components/DashboardCharts";
import { SalesTrendChart } from "@/components/SalesTrendChart";
import { VisitForm } from "@/components/VisitForm";
import { CreateOwnerForm } from "@/components/AccountForms";
import { DeleteWithConfirm } from "@/components/DataActions";
import { deleteOwnerAccount } from "@/app/actions/users";
import { Paginated } from "@/components/Paginated";
import { KonterLog, type LogItem } from "@/components/KonterLog";
import { DataTabs } from "@/components/DataTabs";
import { waLink } from "@/lib/wa";
import { rupiahShort } from "@/lib/format";
import {
  ArrowLeft,
  MapPin,
  MessageCircle,
  ClipboardPen,
  UserPlus,
  CheckCircle2,
} from "lucide-react";

const TICKET_LABEL: Record<string, string> = {
  OPEN: "Terbuka",
  IN_PROGRESS: "Diproses",
  CLOSED: "Selesai",
};

// Tanggal + jam (WIB) untuk timeline aktivitas konter
const fmtDateTime = (d: Date) =>
  new Date(d).toLocaleString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jakarta",
  });

export default async function StoreDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  const store = await prisma.store.findUnique({
    where: { id },
    include: {
      sales: true,
      ownerUser: true,
      prospects: {
        include: {
          // Cukup nama barang — description (daftar HP kompatibel) berat
          product: { select: { name: true } },
          logs: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
      tickets: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!store) notFound();
  if (user.role === "SALES" && store.salesId !== user.id) redirect("/konter");

  const isAdmin = user.role === "ADMIN";

  // Grafik & timeline butuh riwayat penuh toko ini, tapi cukup kolom yang
  // dipakai saja (tanpa discount/price/storeId dsb.)
  const sales = await prisma.sale.findMany({
    where: { storeId: store.id },
    select: {
      id: true,
      total: true,
      qty: true,
      productId: true,
      productName: true,
      createdAt: true,
      createdBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const products = await prisma.product.findMany({
    select: { id: true, name: true, code: true, hpModel: true },
    orderBy: { name: "asc" },
  });

  // Semua log funnel toko ini (bukan cuma yang terbaru) buat timeline aktivitas
  const stageLogs = await prisma.stageLog.findMany({
    where: { prospect: { storeId: store.id } },
    include: {
      prospect: { include: { product: { select: { name: true } } } },
      sales: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const totalRevenue = sales.reduce((a, s) => a + s.total, 0);
  const totalUnits = sales.reduce((a, s) => a + s.qty, 0);

  // Titik penjualan untuk grafik (filter rentang di client)
  const salesPoints = sales.map((s) => ({
    ts: new Date(s.createdAt).getTime(),
    total: s.total,
  }));

  // Produk terlaris (toko ini)
  const byProduct = new Map<string, { units: number; revenue: number }>();
  for (const s of sales) {
    const r = byProduct.get(s.productName) ?? { units: 0, revenue: 0 };
    r.units += s.qty;
    r.revenue += s.total;
    byProduct.set(s.productName, r);
  }
  const topProducts = [...byProduct.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.units - a.units);

  // Terjual per barang (untuk stok vs terjual)
  const soldByProduct = new Map<string, number>();
  for (const s of sales) {
    if (s.productId)
      soldByProduct.set(
        s.productId,
        (soldByProduct.get(s.productId) ?? 0) + s.qty,
      );
  }

  // ===== Log konter: riwayat penting (funnel) + penjualan =====
  // Keluhan tidak dimasukkan sini karena sudah punya tab Tiket sendiri.
  const funnelActs = stageLogs.map((log) => ({
    id: `log-${log.id}`,
    kind: "FUNNEL" as const,
    ts: new Date(log.createdAt).getTime(),
    href: `/prospects/${log.prospectId}`,
    title: log.prospect.product.name,
    subtitle: log.note,
    by: log.sales?.name ?? "-",
    date: fmtDateTime(log.createdAt),
    stage: log.stage,
    result: log.result,
  }));
  const saleActs = sales.map((s) => ({
    id: `sale-${s.id}`,
    kind: "SALE" as const,
    ts: new Date(s.createdAt).getTime(),
    href: `/konter/${store.id}`,
    title: s.productName,
    subtitle: `Terjual ${s.qty} unit · ${rupiahShort(s.total)}`,
    by: s.createdBy?.name ?? "Owner/POS",
    date: fmtDateTime(s.createdAt),
  }));
  const logItems: LogItem[] = [...funnelActs, ...saleActs].sort(
    (a, b) => b.ts - a.ts,
  );

  // ===== Panel-panel (dipakai ulang di tab & di area kelola) =====
  const chartPanel = (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">Grafik Penjualan</h2>
      <div className="flex-1">
        <SalesTrendChart sales={salesPoints} />
      </div>
    </div>
  );

  const topPanel = (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 font-semibold">Produk Terlaris</h2>
      <div className="flex-1">
        <TopProductsChart data={topProducts} />
      </div>
    </div>
  );

  const prospekPanel = (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">
        Prospek / Funnel ({store.prospects.length})
      </h2>
      <Paginated
        perPage={5}
        className="space-y-2"
        empty={<p className="text-sm text-neutral-400">Belum ada prospek.</p>}
        items={store.prospects.map((p) => {
          const sold = soldByProduct.get(p.productId) ?? 0;
          const remaining = Math.max(0, p.stock - sold);
          return (
            <Link
              key={p.id}
              href={`/prospects/${p.id}`}
              className="block rounded-lg border border-neutral-200 p-3 text-sm hover:border-neutral-400"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">
                  {p.product.name}
                </span>
                <StageBadge stage={p.stage} />
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-neutral-500">
                <span>
                  Stok:{" "}
                  <span className="font-semibold text-neutral-800">
                    {p.stock}
                  </span>
                </span>
                <span>
                  Terjual:{" "}
                  <span className="font-semibold text-neutral-800">{sold}</span>
                </span>
                <span>
                  Sisa:{" "}
                  <span className="font-semibold text-neutral-800">
                    {remaining}
                  </span>
                </span>
              </div>
            </Link>
          );
        })}
      />
    </div>
  );

  const tiketPanel = (
    <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 font-semibold">Tiket ({store.tickets.length})</h2>
      <Paginated
        perPage={4}
        className="space-y-2"
        empty={<p className="text-sm text-neutral-400">Belum ada tiket.</p>}
        items={store.tickets.map((t) => {
          const link = waLink(
            store.ownerPhone,
            `Halo${store.ownerName ? " " + store.ownerName : ""}, ini admin Ugorex. Terkait keluhan "${t.subject}" untuk ${store.name}. Boleh dibantu jelaskan lebih lanjut?`,
          );
          return (
            <div
              key={t.id}
              className="rounded-lg border border-neutral-200 p-3 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{t.subject}</span>
                <span className="shrink-0 rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600">
                  {TICKET_LABEL[t.status] ?? t.status}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{t.message}</p>
              {link && (
                <a
                  href={link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1 rounded-lg bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  Balas via WhatsApp
                </a>
              )}
            </div>
          );
        })}
      />
    </div>
  );

  const visitForm = (
    <VisitForm
      storeId={store.id}
      products={products.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        hpModel: p.hpModel,
      }))}
    />
  );

  const ownerBlock = store.ownerUser ? (
    <div className="flex items-center justify-between gap-2">
      <p className="flex min-w-0 items-center gap-1.5 text-sm text-neutral-600">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-neutral-500" />
        <span className="truncate">
          Akun owner aktif:{" "}
          <span className="font-medium">{store.ownerUser.name}</span>
        </span>
      </p>
      <DeleteWithConfirm
        action={deleteOwnerAccount.bind(null, store.id)}
        title="Hapus akun owner"
        confirmText={`Hapus akun owner "${store.ownerUser.name}"? Konter tetap ada, tapi owner tidak bisa login lagi (bisa dibuatkan ulang).`}
      />
    </div>
  ) : (
    <>
      <p className="mb-2 text-sm text-neutral-500">
        Buatkan akun owner toko saat owner setuju ambil barang.
      </p>
      <CreateOwnerForm storeId={store.id} />
    </>
  );

  // Analisis: sama untuk semua role (grafik, produk, prospek, tiket)
  const analysisSections = [
    { tab: "statistik", className: "h-full", node: chartPanel },
    { tab: "statistik", className: "h-full", node: topPanel },
    { tab: "prospek", className: "h-full", node: prospekPanel },
    { tab: "tiket", className: "h-full", node: tiketPanel },
  ];

  // Kelola (tugas sales): buat SALES tampil sebagai tab; buat ADMIN
  // dipindah ke bawah dalam bentuk collapse biar gak nyampur analisis.
  const manageSections = [
    {
      tab: "kelola",
      className: "h-full",
      node: (
        <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-1 font-semibold">Catat Kunjungan / Update Funnel</h2>
          <p className="mb-3 text-xs text-neutral-400">
            Tandai tahap & respon toko atas barang yang ditawarkan
          </p>
          {visitForm}
        </div>
      ),
    },
    {
      tab: "kelola",
      className: "h-full",
      node: (
        <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-semibold">Akun Owner Toko</h2>
          {ownerBlock}
        </div>
      ),
    },
  ];

  // Log konter — cerita toko ini: riwayat penting (funnel) + penjualan.
  // Bisa dipakai baca kenapa toko rame: karena campaign tertentu atau
  // memang lagi banyak yang beli.
  const logSection = {
    tab: "log",
    className: "h-full",
    node: (
      <div className="flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 font-semibold">Log Konter</h2>
        <p className="mb-3 text-xs text-neutral-400">
          Riwayat penting (kunjungan, campaign) & penjualan harian
        </p>
        <KonterLog items={logItems} />
      </div>
    ),
  };

  const tabs = isAdmin
    ? [
        { key: "log", label: "Log" },
        { key: "statistik", label: "Statistik" },
        { key: "prospek", label: "Prospek", count: store.prospects.length },
        { key: "tiket", label: "Tiket", count: store.tickets.length },
      ]
    : [
        { key: "kelola", label: "Kunjungan" },
        { key: "log", label: "Log" },
        { key: "prospek", label: "Prospek", count: store.prospects.length },
        { key: "statistik", label: "Statistik" },
        { key: "tiket", label: "Tiket", count: store.tickets.length },
      ];

  const sections = isAdmin
    ? [logSection, ...analysisSections]
    : [...manageSections, logSection, ...analysisSections];

  return (
    <div className="space-y-6">
      <Link
        href="/konter"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Link>

      {/* Header toko */}
      <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{store.name}</h1>
            <p className="flex items-center gap-1 text-sm text-neutral-500">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              {store.area ?? "-"}
            </p>
          </div>
          {store.ownerUser && (
            <span className="shrink-0 self-start whitespace-nowrap rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white">
              Owner aktif
            </span>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-neutral-400">Owner</dt>
            <dd>{store.ownerName ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Kontak</dt>
            <dd>{store.ownerPhone ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Sales</dt>
            <dd>{store.sales?.name ?? "-"}</dd>
          </div>
          <div>
            <dt className="text-neutral-400">Alamat</dt>
            <dd>{store.address ?? "-"}</dd>
          </div>
        </dl>
      </div>

      {/* Ringkasan */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Total Penjualan</p>
          <p className="truncate text-xl font-bold text-brand lg:text-2xl">
            {rupiahShort(totalRevenue)}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Unit Terjual</p>
          <p className="truncate text-xl font-bold lg:text-2xl">{totalUnits}</p>
        </div>
        <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Prospek</p>
          <p className="truncate text-xl font-bold lg:text-2xl">
            {store.prospects.length}
          </p>
        </div>
        <div className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs text-neutral-500">Tiket</p>
          <p className="truncate text-xl font-bold lg:text-2xl">
            {store.tickets.length}
          </p>
        </div>
      </div>

      {/* Di HP panel dipisah tab; desktop grid 2 kolom (pasangan seimbang) */}
      <DataTabs tabs={tabs} sections={sections} />

      {/* Kelola konter — buat admin, tugas sales di-collapse biar gak ganggu
          fokus analisis. Sales lihat form ini langsung di tab Kunjungan. */}
      {isAdmin && (
        <details className="group rounded-2xl border border-neutral-200 bg-white shadow-sm">
          <summary className="flex cursor-pointer items-center gap-2 p-5 font-semibold">
            <ClipboardPen className="h-4 w-4 text-neutral-500" />
            Kelola konter
            <span className="text-xs font-normal text-neutral-400">
              catat kunjungan · akun owner
            </span>
          </summary>
          <div className="grid grid-cols-1 gap-5 border-t border-neutral-100 p-5 lg:grid-cols-2">
            <div>
              <h3 className="mb-1 font-medium">Catat Kunjungan / Update Funnel</h3>
              <p className="mb-3 text-xs text-neutral-400">
                Tandai tahap & respon toko atas barang yang ditawarkan
              </p>
              {visitForm}
            </div>
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 font-medium">
                <UserPlus className="h-4 w-4 text-neutral-500" />
                Akun Owner Toko
              </h3>
              {ownerBlock}
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
