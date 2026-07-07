"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  MapPin,
  Filter,
  Database,
  Store,
  PlusCircle,
  ShoppingCart,
  Ticket,
  Inbox,
  ListTodo,
  Boxes,
  ShoppingBag,
  Users,
  type LucideIcon,
} from "lucide-react";

type Item = { href: string; label: string; icon: LucideIcon };

const NAV: Record<string, Item[]> = {
  ADMIN: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/prospects", label: "Tracker", icon: MapPin },
    { href: "/funnel", label: "Funnel", icon: Filter },
    { href: "/konter", label: "Konter", icon: Store },
    { href: "/tugas", label: "Tugas", icon: ListTodo },
    { href: "/sales", label: "Sales", icon: Users },
    { href: "/order", label: "Order", icon: ShoppingBag },
    { href: "/data", label: "Data", icon: Database },
    { href: "/request", label: "Request", icon: Inbox },
  ],
  SALES: [
    { href: "/beranda", label: "Dashboard", icon: LayoutDashboard },
    { href: "/konter", label: "Konter", icon: Store },
    { href: "/tugas", label: "Tugas", icon: ListTodo },
    { href: "/order", label: "Order", icon: ShoppingBag },
    { href: "/konter/baru", label: "Tambah", icon: PlusCircle },
    { href: "/request", label: "Request", icon: Inbox },
  ],
  OWNER: [
    { href: "/pos", label: "POS", icon: ShoppingCart },
    { href: "/order", label: "Order", icon: ShoppingBag },
    { href: "/stok", label: "Stok", icon: Boxes },
    { href: "/tiket", label: "Tiket", icon: Ticket },
    { href: "/request", label: "Request", icon: Inbox },
  ],
};

function useItems(role: string) {
  return NAV[role] ?? NAV.ADMIN;
}

// href paling spesifik yang cocok dengan pathname
function activeHref(pathname: string, items: Item[]) {
  let best = "";
  for (const it of items) {
    if (
      (pathname === it.href || pathname.startsWith(it.href + "/")) &&
      it.href.length > best.length
    )
      best = it.href;
  }
  return best;
}

// Badge jumlah order menunggu diproses (notifikasi di dalam web)
function OrderBadge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}

export function BottomNav({
  role,
  orderBadge = 0,
}: {
  role: string;
  orderBadge?: number;
}) {
  const pathname = usePathname();
  const items = useItems(role);
  const active = activeHref(pathname, items);
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 grid border-t border-neutral-200 bg-white sm:hidden"
      style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0,1fr))` }}
    >
      {items.map((it) => {
        const Icon = it.icon;
        const on = it.href === active;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex flex-col items-center gap-0.5 py-2.5 text-xs ${on ? "font-semibold text-neutral-900" : "text-neutral-400"
              }`}
          >
            <span className="relative">
              <Icon className="h-5 w-5" strokeWidth={2} />
              {it.href === "/order" && (
                <span className="absolute -right-2 -top-1">
                  <OrderBadge n={orderBadge} />
                </span>
              )}
            </span>
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideNav({
  role,
  orderBadge = 0,
}: {
  role: string;
  orderBadge?: number;
}) {
  const pathname = usePathname();
  const items = useItems(role);
  const active = activeHref(pathname, items);
  return (
    <nav className="hidden w-52 shrink-0 flex-col gap-1 border-r border-neutral-200 bg-white p-3 sm:flex">
      {items.map((it) => {
        const Icon = it.icon;
        const on = it.href === active;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${on
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100"
              }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            <span className="flex-1">{it.label}</span>
            {it.href === "/order" && <OrderBadge n={orderBadge} />}
          </Link>
        );
      })}
    </nav>
  );
}
