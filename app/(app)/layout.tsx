import Image from "next/image";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { logout } from "@/app/actions/auth";
import { ROLE_LABEL, type Role } from "@/lib/constants";
import { BottomNav, SideNav } from "@/components/Nav";
import { SubmitButton } from "@/components/SubmitButton";
import { PushToggle } from "@/components/PushToggle";

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

  return (
    <div className="flex flex-1 flex-col overflow-x-hidden">
      {/* Header */}
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-neutral-200 bg-white px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
            <Image
              src="/logo.webp"
              alt="Ugorex"
              fill
              sizes="36px"
              className="object-cover object-top"
              priority
            />
          </div>
          <span className="truncate font-semibold">Ugorex Tracker</span>
        </div>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {user.role !== "OWNER" && <PushToggle />}
          <div className="max-w-[35vw] text-right sm:max-w-none">
            <p className="truncate text-sm font-medium leading-tight">
              {user.name}
            </p>
            <p className="hidden text-xs leading-tight text-neutral-400 sm:block">
              {ROLE_LABEL[user.role as Role] ?? user.role}
            </p>
          </div>
          <form action={logout}>
            <SubmitButton
              pendingText="Keluar…"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
            >
              Keluar
            </SubmitButton>
          </form>
        </div>
      </header>

      <div className="flex flex-1">
        <SideNav role={user.role} orderBadge={orderBadge} />
        <main className="w-full min-w-0 flex-1 p-4 pb-20 sm:p-6 sm:pb-6">
          {children}
        </main>
      </div>

      <BottomNav role={user.role} orderBadge={orderBadge} />
    </div>
  );
}
