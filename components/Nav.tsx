"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { usePush } from "@/components/LogoPush";
import {
  LayoutDashboard,
  MapPin,
  Filter,
  Database,
  Store,
  PlusCircle,
  ShoppingCart,
  MessagesSquare,
  Inbox,
  ListTodo,
  ShoppingBag,
  Users,
  User,
  Wallet,
  Coins,
  X,
  Bell,
  BellOff,
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
    { href: "/keuangan", label: "Keuangan", icon: Wallet },
    { href: "/payroll", label: "Payroll", icon: Coins },
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
    { href: "/pos", label: "Penjualan", icon: ShoppingCart },
    // Stok digabung jadi tab di dalam /order (dulu /stok halaman terpisah)
    { href: "/order", label: "Belanja", icon: ShoppingBag },
    // Komplain + Request dilebur jadi satu pintu Feedback (kategori:
    // keluhan / saran / request barang)
    { href: "/feedback", label: "Feedback", icon: MessagesSquare },
    { href: "/profil", label: "Profil", icon: User },
  ],

  GUDANG: [{ href: "/gudang", label: "Paket", icon: ShoppingBag }],
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
  badges = {},
}: {
  role: string;
  badges?: Record<string, number>;
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
              {(badges[it.href] ?? 0) > 0 && (
                <span className="absolute -right-2 -top-1">
                  <OrderBadge n={badges[it.href]} />
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

// Nav horizontal atas (desktop) — dipakai role tanpa sidebar (mis. OWNER),
// gaya tab garis-bawah kaya marketplace (Tokopedia/Shopee): baris tab, bukan
// panel kiri permanen.
export function TopNav({
  role,
  badges = {},
}: {
  role: string;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = useItems(role);
  const active = activeHref(pathname, items);
  return (
    <nav className="mb-4 hidden gap-1 overflow-x-auto border-b border-neutral-200 sm:flex">
      {items.map((it) => {
        const Icon = it.icon;
        const on = it.href === active;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              on
                ? "border-neutral-900 text-neutral-900"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
            {it.label}
            {(badges[it.href] ?? 0) > 0 && <OrderBadge n={badges[it.href]} />}
          </Link>
        );
      })}
    </nav>
  );
}

export function SideNav({
  role,
  badges = {},
}: {
  role: string;
  badges?: Record<string, number>;
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
            {(badges[it.href] ?? 0) > 0 && <OrderBadge n={badges[it.href]} />}
          </Link>
        );
      })}
    </nav>
  );
}

// Baris "Aktifkan notifikasi" di dalam drawer (mobile) — pengganti fungsi
// klik logo yang di desktop dipakai untuk push.
function PushRow() {
  const { status, enable } = usePush();
  if (status === "unsupported") return null;
  const on = status === "on";
  return (
    <button
      type="button"
      onClick={enable}
      disabled={status !== "off"}
      className="flex w-full items-center gap-2 border-t border-neutral-200 p-4 text-sm text-neutral-600 disabled:cursor-default"
    >
      {on ? (
        <Bell className="h-4 w-4 shrink-0 text-brand-dark" />
      ) : (
        <BellOff className="h-4 w-4 shrink-0 text-neutral-400" />
      )}
      <span className="flex-1 text-left">
        {on
          ? "Notifikasi aktif"
          : status === "loading"
            ? "Memeriksa…"
            : "Aktifkan notifikasi"}
      </span>
    </button>
  );
}

// Menu drawer khusus mobile: trigger = logo + judul di header; klik buka
// panel geser berisi semua menu (nav admin/sales/owner bisa banyak item).
// Menggantikan bottom nav yang kepenuhan.
export function MobileNav({
  role,
  badges = {},
}: {
  role: string;
  badges?: Record<string, number>;
}) {
  const pathname = usePathname();
  const items = useItems(role);
  const active = activeHref(pathname, items);
  // `open` = drawer masih di DOM; `visible` = kelas animasi aktif. Buka:
  // mount lalu next-frame nyalakan visible (slide masuk). Tutup: matikan
  // visible (slide keluar) lalu unmount setelah animasi (200ms).
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState(false);
  const { status } = usePush();

  const openDrawer = () => {
    setOpen(true);
    requestAnimationFrame(() => setVisible(true));
  };
  const closeDrawer = () => {
    setVisible(false);
    setTimeout(() => setOpen(false), 200);
  };

  // Tutup dengan Escape + kunci scroll body saat drawer terbuka
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      {/* Trigger (mobile) */}
      <button
        type="button"
        onClick={openDrawer}
        aria-label="Buka menu"
        className="flex min-w-0 items-center gap-2 sm:hidden"
      >
        <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
          <Image
            src="/logo.webp"
            alt="Ugorex"
            fill
            sizes="36px"
            className="object-cover object-top"
            priority
          />
          {status === "on" && (
            <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white bg-brand" />
          )}
        </span>
        <span className="truncate font-semibold">Ugorex Tracker</span>
      </button>

      {/* Drawer — backdrop fade + panel slide dari kiri (smooth buka/tutup) */}
      {open && (
        <div className="fixed inset-0 z-40 sm:hidden">
          <div
            className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
            onClick={closeDrawer}
          />
          <nav
            className={`absolute inset-y-0 left-0 flex w-64 max-w-[82%] flex-col bg-white shadow-xl transition-transform duration-200 ease-out ${
              visible ? "translate-x-0" : "-translate-x-full"
            }`}
          >
            <div className="flex items-center justify-between border-b border-neutral-200 p-4">
              <span className="font-semibold">Menu</span>
              <button
                type="button"
                onClick={closeDrawer}
                aria-label="Tutup menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-1 overflow-y-auto p-3">
              {items.map((it) => {
                const Icon = it.icon;
                const on = it.href === active;
                return (
                  <Link
                    key={it.href}
                    href={it.href}
                    onClick={closeDrawer}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${on
                      ? "bg-neutral-900 text-white"
                      : "text-neutral-600 hover:bg-neutral-100"
                      }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" strokeWidth={2} />
                    <span className="flex-1">{it.label}</span>
                    {(badges[it.href] ?? 0) > 0 && (
                      <OrderBadge n={badges[it.href]} />
                    )}
                  </Link>
                );
              })}
            </div>
            <PushRow />
          </nav>
        </div>
      )}
    </>
  );
}
