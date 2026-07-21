"use client";

import { useState } from "react";
import Link from "next/link";
import { logout } from "@/app/actions/auth";
import { ChevronDown, LogOut, User } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";

// Menu user di header: klik nama → dropdown berisi info akun, link ke
// Profil Saya (ganti password/no HP/data lain ada di sana - lihat
// app/(app)/profil), dan tombol Keluar.
export function UserMenu({
  name,
  role,
  phone,
}: {
  name: string;
  role: string;
  phone?: string;
}) {
  const [open, setOpen] = useState(false);

  const itemCls =
    "flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50";

  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex max-w-[38vw] items-center gap-1 rounded-lg px-1.5 py-1 text-left hover:bg-neutral-100 sm:max-w-none"
        title="Menu akun"
      >
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium leading-tight">
            {name}
          </span>
          <span className="hidden text-xs leading-tight text-neutral-400 sm:block">
            {role}
          </span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <>
          {/* Klik di luar = tutup */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-100 px-3 py-2">
              <p className="truncate text-xs font-semibold text-neutral-800">
                {name}
              </p>
              <p className="text-[11px] text-neutral-400">
                {role}
                {phone ? ` · ${phone}` : ""}
              </p>
            </div>
            <div className="border-b border-neutral-100">
              <Link
                href="/profil"
                onClick={() => setOpen(false)}
                className={itemCls}
              >
                <User className="h-4 w-4" />
                Profil Saya
              </Link>
            </div>
            <form action={logout}>
              <SubmitButton
                pendingText="Keluar…"
                className={`${itemCls} disabled:opacity-60`}
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </SubmitButton>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
