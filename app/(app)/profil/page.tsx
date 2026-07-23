import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { wibMonthStart } from "@/lib/date";
import { computeLevel } from "@/lib/sales-kpi-grade";
import {
  computeSalesKpiValues,
  activeDaysBySalesFrom,
} from "@/lib/sales-kpi-values";
import { getScoreTargets } from "@/lib/kpi-config";
import {
  getPriorScoreRows,
  recordMonthlyScore,
  wibPeriod,
} from "@/lib/sales-score-history";
import { ProfileView } from "@/components/ProfileView";
import { getCsContact } from "@/lib/cs-config";

export default async function ProfilPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const extra =
    user.role === "SALES" || user.role === "GUDANG"
      ? {
          locationLabel:
            user.role === "SALES" ? "Titik Rumah" : "Titik Gudang",
          showNik: user.role === "SALES",
          bankAccount: user.bankAccount,
          nik: user.nik,
          homeLat: user.homeLat,
          homeLng: user.homeLng,
        }
      : null;

  // Data toko self-service (khusus OWNER) — nama toko cuma ditampilkan
  // (baca lib/actions/account.ts updateOwnStore untuk field yang boleh diubah).
  const storeInfo =
    user.role === "OWNER" && user.ownedStore
      ? {
          storeName: user.ownedStore.name,
          address: user.ownedStore.address,
          ownerName: user.ownedStore.ownerName,
          ownerPhone: user.ownedStore.ownerPhone,
          lat: user.ownedStore.lat,
          lng: user.ownedStore.lng,
        }
      : null;

  // Kontak "Hubungi CS" (khusus OWNER): CS Ugorex + sales pemegang tokonya.
  let contactInfo: {
    cs: { name: string; phone: string | null };
    sales: { name: string; phone: string } | null;
  } | null = null;
  if (user.role === "OWNER" && user.ownedStore) {
    const [cs, store] = await Promise.all([
      getCsContact(),
      prisma.store.findUnique({
        where: { id: user.ownedStore.id },
        select: { sales: { select: { name: true, phone: true } } },
      }),
    ]);
    contactInfo = {
      cs,
      sales: store?.sales ? { name: store.sales.name, phone: store.sales.phone } : null,
    };
  }

  // Grade & level (rumus sama dgn beranda - lib/sales-kpi-grade.ts) buat
  // ditampilkan di kartu identitas, khusus SALES.
  let gradeInfo: { grade: string; level: number; levelName: string } | null =
    null;
  if (user.role === "SALES") {
    const monthStart = wibMonthStart();
    const period = wibPeriod();
    const [stores, prospects, kpiOrders, activeLogRows, scoreTargets, priorRows] =
      await Promise.all([
        prisma.store.findMany({
          where: { salesId: user.id },
          select: { id: true, createdAt: true },
        }),
        prisma.prospect.findMany({
          where: { store: { salesId: user.id } },
          select: { storeId: true, stage: true },
        }),
        prisma.request.findMany({
          where: {
            items: { some: {} },
            paymentStatus: "PAID",
            status: { not: "CANCELLED" },
            createdAt: { gte: monthStart },
            store: { salesId: user.id },
          },
          select: { storeId: true, total: true },
        }),
        prisma.stageLog.findMany({
          where: {
            prospect: { store: { salesId: user.id } },
            createdAt: { gte: monthStart },
          },
          select: { createdAt: true },
        }),
        getScoreTargets(),
        getPriorScoreRows(user.id, period),
      ]);

    // Hari aktif — via lib/sales-kpi-values.ts activeDaysBySalesFrom, SATU
    // algoritma yang sama dipakai beranda, leaderboard /sales, detail
    // /sales/[id], & /tugas biar skor/level sales tidak beda antar halaman.
    const activeDays =
      activeDaysBySalesFrom(
        activeLogRows.map((l) => ({ salesId: user.id, createdAt: l.createdAt })),
      ).get(user.id) ?? 0;

    const kpiValues = computeSalesKpiValues({
      stores,
      ordersMonth: kpiOrders,
      prospects,
      activeDays,
      monthStart,
    });
    const result = computeLevel(
      kpiValues,
      scoreTargets,
      user.captainArea,
      priorRows.map((r) => r.score),
    );
    recordMonthlyScore(user.id, period, result.score);
    gradeInfo = {
      grade: result.grade,
      level: result.level,
      levelName: result.levelName,
    };
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Profil</h1>
        <p className="text-sm text-neutral-500">
          Kelola akun dan informasi pribadi
        </p>
      </div>
      <ProfileView
        name={user.name}
        roleLabel={ROLE_LABEL[user.role as Role] ?? user.role}
        phone={user.phone}
        extra={extra}
        gradeInfo={gradeInfo}
        store={storeInfo}
        contact={contactInfo}
      />
    </div>
  );
}
