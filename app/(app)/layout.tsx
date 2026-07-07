import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { SideNav, MobileNav } from "@/components/Nav";
import { LogoPush } from "@/components/LogoPush";
import { NotifBell } from "@/components/NotifBell";
import { UserMenu } from "@/components/UserMenu";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // Notifikasi web: jumlah order restok yang menunggu diproses
  let orderBadge = 0;
  if (user.role !== "OWNER") {
    orderBadge = await prisma.request.count({
      where: {
        status: "PENDING",
        items: { some: {} },
        ...(user.role === "SALES" ? { store: { salesId: user.id } } : {}),
      },
    });
  }

  // Riwayat notifikasi in-app untuk lonceng di header
  const notifs = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="flex flex-1 flex-col overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {/* Mobile: logo + judul = buka drawer menu */}
          <MobileNav role={user.role} orderBadge={orderBadge} />
          {/* Desktop: klik logo = aktifkan izin push di perangkat ini */}
          <div className="hidden min-w-0 items-center gap-2 sm:flex">
            <LogoPush />
            <span className="truncate font-semibold">Ugorex Tracker</span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* Klik nama = dropdown akun (Keluar pindah ke sini) */}
          <UserMenu
            name={user.name}
            role={ROLE_LABEL[user.role as Role] ?? user.role}
          />
          {/* Lonceng riwayat notifikasi — paling kanan */}
          <NotifBell
            items={notifs.map((n) => ({
              id: n.id,
              title: n.title,
              body: n.body,
              url: n.url,
              read: n.readAt !== null,
              createdAt: n.createdAt.toISOString(),
            }))}
          />
        </div>
      </header>

      <div className="flex flex-1">
        <SideNav role={user.role} orderBadge={orderBadge} />
        <main className="w-full min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
