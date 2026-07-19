import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { PrintResiButton } from "@/components/PrintResiButton";
import { AutoPrintResi } from "@/components/AutoPrintResi";
import { ResiFitScale } from "@/components/ResiFitScale";
import { ResiLabel } from "@/components/ResiLabel";
import { ResiPrintStyle } from "@/components/ResiPrintStyle";
import { ArrowLeft } from "lucide-react";

// Label resi cetak (ala label marketplace) — di luar grup (app) supaya
// tercetak polos tanpa navbar. Dibuka lewat aksi Cetak Resi di /order.
// Markup label + CSS print + auto-fit dipakai bersama dengan halaman
// cetak massal (/order/resi-massal).
export default async function ResiPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ auto?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id } = await params;
  const { auto } = await searchParams;
  const req = await prisma.request.findUnique({
    where: { id },
    include: {
      store: { include: { sales: true } },
      items: {
        include: { product: { select: { name: true, code: true } } },
      },
    },
  });
  if (!req || req.items.length === 0) notFound();

  const allowed =
    user.role === "ADMIN" ||
    (user.role === "SALES" && req.store.salesId === user.id);
  if (!allowed) notFound();

  // Resi dibuat lewat aksi Cetak Resi — halaman ini tidak bikin sendiri
  if (!req.resiNo) redirect("/order");

  return (
    <div className="min-h-screen bg-neutral-100 py-6 print:bg-white print:py-0">
      {/* Datang dari tombol Cetak Resi → dialog print langsung terbuka,
          selesai/batal balik ke /order */}
      {auto === "1" && <AutoPrintResi />}
      {/* Auto-fit: label di-skala pas 1 halaman label 100×150mm */}
      <ResiFitScale />
      <ResiPrintStyle />

      {/* Toolbar — hilang saat print */}
      <div className="mx-auto mb-4 flex w-full max-w-md items-center justify-between px-4 print:hidden">
        <Link
          href="/order"
          className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-bold text-neutral-700 hover:bg-neutral-50"
        >
          <ArrowLeft className="h-4 w-4" />
          Kembali
        </Link>
        <PrintResiButton />
      </div>

      {/* id struk-print: globals.css menyembunyikan semua elemen lain saat
          print (aturan yang sama dengan struk POS) — tanpa id ini hasil
          cetak blank putih */}
      <div id="struk-print">
        <ResiLabel order={req} />
      </div>
    </div>
  );
}
