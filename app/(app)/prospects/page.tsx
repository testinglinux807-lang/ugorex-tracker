import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import fs from "fs";
import path from "path";
import { StageBadge } from "@/components/Badge";
import { TrackerMap } from "@/components/TrackerMap";
import { KecamatanRanking } from "@/components/KecamatanRanking";
import { Paginated } from "@/components/Paginated";
import type { MapPoint } from "@/components/MapInner";
import { rankKecamatan, type KecStat } from "@/lib/geo";
import { Plus, MapPin } from "lucide-react";

function scopeWhere(user: { id: string; role: string }) {
  if (user.role === "SALES") return { salesId: user.id };
  if (user.role === "OWNER") return { store: { ownerUserId: user.id } };
  return {};
}

export default async function ProspectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");

  const [prospects, salesHomeRows] = await Promise.all([
    prisma.prospect.findMany({
      where: scopeWhere(user),
      include: {
        store: true,
        // Cukup nama barang — description (daftar HP kompatibel) berat
        product: { select: { name: true } },
        sales: true,
        logs: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
    // Rumah semua sales — radius kerja 7 km di peta (toggle di toolbar)
    prisma.user.findMany({
      where: { role: "SALES", homeLat: { not: null }, homeLng: { not: null } },
      select: { name: true, homeLat: true, homeLng: true },
    }),
  ]);
  const salesHomes = salesHomeRows.map((s) => ({
    lat: s.homeLat as number,
    lng: s.homeLng as number,
    name: s.name,
  }));

  const canCreate = user.role !== "OWNER";

  // Titik untuk peta (hanya konter yang punya koordinat)
  const points: MapPoint[] = prospects
    .filter((p) => p.store.lat != null && p.store.lng != null)
    .map((p) => ({
      id: p.id,
      storeId: p.storeId,
      product: p.product.name,
      store: p.store.name,
      area: p.store.area,
      stage: p.stage,
      result: p.logs[0]?.result ?? "NEUTRAL",
      lat: p.store.lat as number,
      lng: p.store.lng as number,
    }));

  // Ranking kecamatan (server-side point-in-polygon)
  let ranking: KecStat[] = [];
  try {
    const kecPath = path.join(
      process.cwd(),
      "public",
      "karawang-kecamatan.geojson",
    );
    const kj = JSON.parse(fs.readFileSync(kecPath, "utf8"));
    ranking = rankKecamatan(points, kj.features ?? []);
  } catch {
    ranking = [];
  }

  const prospectCards = prospects.map((p) => {
    const last = p.logs[0];
    return (
      <Link
        key={p.id}
        href={`/prospects/${p.id}`}
        className="block rounded-xl border border-neutral-200 bg-white p-4 transition hover:border-neutral-400"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{p.product.name}</p>
            <p className="truncate text-sm text-neutral-500">
              {p.store.name}
              {p.store.area ? ` · ${p.store.area}` : ""}
            </p>
            {last && (
              <p className="mt-1 truncate text-xs text-neutral-400">
                “{last.note}”
              </p>
            )}
          </div>
          <span className="shrink-0">
            <StageBadge stage={p.stage} />
          </span>
        </div>
      </Link>
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Tracker</h1>
          <p className="text-sm text-neutral-500">
            {prospects.length} barang dilacak di konter
          </p>
        </div>
        {canCreate && (
          <Link
            href="/prospects/new"
            className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
          >
            <Plus className="h-4 w-4" />
            Prospek
          </Link>
        )}
      </div>

      {/* Peta sebaran konter (Karawang) */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-sm font-medium text-neutral-700">
          <MapPin className="h-4 w-4" />
          Sebaran Konter — Karawang
          <span className="font-normal text-neutral-400">
            ({points.length} titik)
          </span>
        </div>
        <TrackerMap points={points} homePoints={salesHomes} />
        <p className="mt-2 text-xs text-neutral-400">
          Warna kecamatan = zona minat (5 tingkat,{" "}
          <span className="font-semibold text-green-600">hijau</span> potensial →{" "}
          <span className="font-semibold text-red-600">merah</span> zona mati).
          Klik titik untuk detail.
        </p>
      </section>

      {/* Ranking + daftar prospek */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="min-w-0 lg:col-span-1">
          <KecamatanRanking ranking={ranking} />
        </div>

        <section className="min-w-0 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-3 font-semibold">
            Daftar Prospek ({prospects.length})
          </h2>
          <Paginated
            perPage={6}
            className="grid grid-cols-1 gap-3 sm:grid-cols-2"
            empty={
              <div className="rounded-xl border border-dashed border-neutral-300 p-8 text-center">
                <p className="text-neutral-500">Belum ada prospek.</p>
                {canCreate && (
                  <Link
                    href="/prospects/new"
                    className="mt-3 inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Tambah prospek pertama
                  </Link>
                )}
              </div>
            }
            items={prospectCards}
          />
        </section>
      </div>
    </div>
  );
}
