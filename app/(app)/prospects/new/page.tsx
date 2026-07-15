import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { createProspect } from "@/app/actions/tracker";
import { SubmitButton } from "@/components/SubmitButton";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default async function NewProspectPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  // Sales hanya lihat konternya sendiri; admin lihat semua
  const stores = await prisma.store.findMany({
    where: user.role === "SALES" ? { salesId: user.id } : {},
    orderBy: { name: "asc" },
  });
  const products = await prisma.product.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="space-y-4">
      <Link
        href="/prospects"
        className="inline-flex items-center gap-1 text-sm text-neutral-500 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Link>
      <h1 className="text-2xl font-bold">Prospek Baru</h1>

      {stores.length === 0 || products.length === 0 ? (
        <div className="rounded-xl border border-neutral-300 bg-neutral-100 p-4 text-sm text-neutral-700">
          {stores.length === 0 && <p>Belum ada konter. </p>}
          {products.length === 0 && <p>Belum ada barang. </p>}
          <Link
            href="/data"
            className="inline-flex items-center gap-1 font-semibold underline"
          >
            Tambah dulu di menu Data
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ) : (
        <form
          action={createProspect}
          className="space-y-4 rounded-xl border border-neutral-200 bg-white p-5"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Konter / Toko
            </label>
            <select
              name="storeId"
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">— Pilih konter —</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.area ? ` (${s.area})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Barang
            </label>
            <select
              name="productId"
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            >
              <option value="">— Pilih barang —</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <SubmitButton
            pendingText="Membuat…"
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
          >
            Buat & Mulai Tracking
          </SubmitButton>
        </form>
      )}
    </div>
  );
}
