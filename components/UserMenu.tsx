"use client";

import { useState } from "react";
import { logout } from "@/app/actions/auth";
import { ChevronDown, LogOut, KeyRound, Smartphone } from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";
import {
  ChangePasswordModal,
  ChangePhoneModal,
} from "@/components/AccountSettings";

// Menu user di header: klik nama → dropdown berisi info akun + tombol
// Keluar (menggantikan tombol "Keluar" yang selalu tampil dan makan
// tempat di header mobile). Untuk admin ada juga Ganti Password &
// Ganti No HP (OTP via WA) — lihat components/AccountSettings.tsx.
export function UserMenu({
  name,
  role,
  phone,
  canManageAccount = false,
}: {
  name: string;
  role: string;
  phone?: string;
  canManageAccount?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"password" | "phone" | null>(null);

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
            {canManageAccount && (
              <div className="border-b border-neutral-100">
                <button
                  type="button"
                  className={itemCls}
                  onClick={() => {
                    setOpen(false);
                    setModal("password");
                  }}
                >
                  <KeyRound className="h-4 w-4" />
                  Ganti Password
                </button>
                <button
                  type="button"
                  className={itemCls}
                  onClick={() => {
                    setOpen(false);
                    setModal("phone");
                  }}
                >
                  <Smartphone className="h-4 w-4" />
                  Ganti No HP
                </button>
              </div>
            )}
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

      {modal === "password" && (
        <ChangePasswordModal onClose={() => setModal(null)} />
      )}
      {modal === "phone" && (
        <ChangePhoneModal
          currentPhone={phone ?? "-"}
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}
