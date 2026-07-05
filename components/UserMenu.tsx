"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { ChevronDown, LogOut } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";

// Menu user di header: klik nama → dropdown berisi info akun + tombol
// Keluar (menggantikan tombol "Keluar" yang selalu tampil dan makan
// tempat di header mobile).
export function UserMenu({ name, role }: { name: string; role: string }) {
  const [open, setOpen] = useState(false);

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
          <div className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl">
            <div className="border-b border-neutral-100 px-3 py-2">
              <p className="truncate text-xs font-semibold text-neutral-800">
                {name}
              </p>
              <p className="text-[11px] text-neutral-400">{role}</p>
            </div>
            <form action={logout}>
              <SubmitButton
                pendingText="Keluar…"
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
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
