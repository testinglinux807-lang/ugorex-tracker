"use client";

import { useState } from "react";
import Link from "next/link";
import { markNotificationsRead } from "@/app/actions/push";
import { Bell, Inbox } from "lucide-react";

export type NotifItem = {
  id: string;
  title: string;
  body: string;
  url: string | null;
  read: boolean;
  createdAt: string; // ISO — di-serialize dari server
};

// Lonceng di header: buka riwayat notifikasi user ini (order baru/lunas
// untuk admin & sales; dikirim/sampai untuk owner). Angka = belum dibaca;
// membuka dropdown menandai semuanya terbaca. Aktif/nonaktif push-nya
// sendiri lewat klik logo (LogoPush).
export function NotifBell({ items }: { items: NotifItem[] }) {
  const [open, setOpen] = useState(false);
  const [readAll, setReadAll] = useState(false);
  const unread = readAll ? 0 : items.filter((n) => !n.read).length;

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setReadAll(true);
      markNotificationsRead().catch(() => {});
    }
  }

  const timeOf = (iso: string) =>
    new Date(iso).toLocaleString("id-ID", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        title="Riwayat notifikasi"
        className={`relative flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
          open
            ? "border-neutral-900 bg-neutral-900 text-white"
            : "border-neutral-200 text-neutral-500 hover:bg-neutral-100"
        }`}
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-neutral-900">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Klik di luar = tutup */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
            <p className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold text-neutral-700">
              Notifikasi
            </p>
            {items.length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-3 py-8 text-neutral-300">
                <Inbox className="h-6 w-6" />
                <p className="text-xs text-neutral-400">Belum ada notifikasi.</p>
              </div>
            ) : (
              <ul className="max-h-80 divide-y divide-neutral-100 overflow-y-auto">
                {items.map((n) => {
                  const inner = (
                    <div className="flex items-start gap-2">
                      {!n.read && !readAll && (
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-neutral-800">
                          {n.title}
                        </p>
                        <p className="mt-0.5 text-xs text-neutral-500">
                          {n.body}
                        </p>
                        <p className="mt-0.5 text-[10px] text-neutral-400">
                          {timeOf(n.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                  return (
                    <li key={n.id} className={n.read || readAll ? "" : "bg-neutral-50"}>
                      {n.url ? (
                        <Link
                          href={n.url}
                          onClick={() => setOpen(false)}
                          className="block px-3 py-2.5 hover:bg-neutral-100"
                        >
                          {inner}
                        </Link>
                      ) : (
                        <div className="px-3 py-2.5">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
