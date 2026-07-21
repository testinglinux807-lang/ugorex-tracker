import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PrintResiButton } from "@/components/PrintResiButton";
import { AutoPrintResi } from "@/components/AutoPrintResi";
import { ResiFitScale } from "@/components/ResiFitScale";
import { ResiLabel } from "@/components/ResiLabel";
import { ResiPrintStyle } from "@/components/ResiPrintStyle";
import {
  loadGudangLocs,
  getGudangRadiusKm,
  assignForOrder,
} from "@/lib/gudang-assign";
import { ArrowLeft } from "lucide-react";

// Cetak resi MASSAL (admin) — semua order yang belum dikirim (Disiapkan
// Gudang + Siap Dipickup) jadi satu dokumen print, SATU label per lembar
// 100×150mm (break-after: page di ResiPrintStyle). Dibuka lewat tombol
// "Cetak Semua Resi" di /order (aksi printAllOrderResi yang sekalian
// membuatkan nomor resi untuk order yang belum punya).
export default async function ResiMassalPage({
  searchParams,
}: {
  searchParams: Promise<{ auto?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN" && user.role !== "GUDANG") redirect("/order");
  const isGudang = user.role === "GUDANG";
  const backHref = isGudang ? "/gudang" : "/order";

  const { auto } = await searchParams;
  const all = await prisma.request.findMany({
    where: {
      items: { some: {} },
      status: { in: ["PENDING", "READY"] },
      resiNo: { not: null },
    },
    include: {
      store: { include: { sales: true } },
      items: { include: { product: { select: { name: true, code: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Gudang: hanya resi paket yang ditugaskan ke dirinya
  let orders = all;
  if (isGudang) {
    const [gudangs, radius] = await Promise.all([
      loadGudangLocs(),
      getGudangRadiusKm(),
    ]);
    orders = all.filter((o) => {
      const a = assignForOrder(o, gudangs, radius);
      return a != null && a.gudangId === user.id;
    });
  }

  if (orders.length === 0) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 p-6">
        <div className="rounded-2xl border border-neutral-200 bg-white p-8 text-center">
          <p className="text-sm text-neutral-600">
            Tidak ada paket yang perlu dicetak resinya.
          </p>
          <Link
            href={backHref}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Kembali ke Order
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      {auto === "1" && <AutoPrintResi />}
      <ResiFitScale />
      <ResiPrintStyle />

      {/* Toolbar — hilang saat print */}
      <div className="mx-auto mb-4 flex w-full max-w-md items-center justify-between px-4 print:hidden">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Link>
        <span className="text-sm font-semibold text-neutral-600">
          {orders.length} label
        </span>
        <PrintResiButton />
      </div>

      {/* id struk-print: globals.css menyembunyikan elemen lain saat print */}
      <div id="struk-print" className="space-y-6 print:space-y-0">
        {orders.map((o) => (
          <ResiLabel key={o.id} order={o} />
        ))}
      </div>
    </div>
  );
}
