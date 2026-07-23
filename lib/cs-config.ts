import "server-only";
import { prisma } from "./prisma";

// Kontak CS Ugorex (disimpan di tabel Config key-value, sama pola dgn
// lib/kpi-config.ts) — ditampilkan di /profil owner buat nanya-nanya di
// luar urusan sales pemegang tokonya.
export async function getCsContact(): Promise<{
  name: string;
  phone: string | null;
}> {
  const rows = await prisma.config.findMany({
    where: { key: { in: ["cs_name", "cs_phone"] } },
  });
  const m = new Map(rows.map((r) => [r.key, r.value]));
  return {
    name: m.get("cs_name") || "CS Ugorex",
    phone: m.get("cs_phone") || null,
  };
}
