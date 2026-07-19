"use client";

import { useActionState, useState } from "react";
import { createSalesInvite, deleteSalesInvite } from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";
import { Check, Copy, Link2, Trash2 } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export type SalesInviteItem = {
  id: string;
  url: string;
  note: string | null;
  status: "AKTIF" | "TERPAKAI" | "KEDALUWARSA";
  expiresAtLabel: string;
};

const STATUS_CLS: Record<SalesInviteItem["status"], string> = {
  AKTIF: "border-brand-dark bg-brand/20 text-neutral-900",
  TERPAKAI: "border-neutral-300 bg-neutral-100 text-neutral-500",
  KEDALUWARSA: "border-neutral-300 bg-white text-neutral-400 line-through",
};

// Kelola link registrasi sales (panel Tambah Sales di /sales, admin):
// buat link sekali-pakai (7 hari), salin, dan cabut.
export function SalesInviteManager({
  invites,
}: {
  invites: SalesInviteItem[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createSalesInvite(fd)) ?? null,
    null,
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function copy(inv: SalesInviteItem) {
    try {
      await navigator.clipboard.writeText(inv.url);
      setCopiedId(inv.id);
      setTimeout(() => setCopiedId((v) => (v === inv.id ? null : v)), 2000);
    } catch {
      // Clipboard bisa ditolak (http non-localhost) — biarkan user salin manual
      window.prompt("Salin link ini:", inv.url);
    }
  }

  return (
    <div className="space-y-3">
      <form action={formAction} className="flex flex-col gap-2 sm:flex-row">
        <input
          name="note"
          placeholder="Catatan (mis. buat Andi) — opsional"
          className={inputCls}
        />
        <button
          disabled={pending}
          className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? (
            <PendingLabel text="Membuat…" />
          ) : (
            <>
              <Link2 className="h-4 w-4" />
              Buat Link Registrasi
            </>
          )}
        </button>
      </form>
      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {state.error}
        </p>
      )}

      {invites.length > 0 && (
        <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center gap-2 p-2.5 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs text-neutral-600">
                  {inv.url}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-neutral-400">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLS[inv.status]}`}
                  >
                    {inv.status === "AKTIF"
                      ? `Aktif s/d ${inv.expiresAtLabel}`
                      : inv.status === "TERPAKAI"
                        ? "Sudah terpakai"
                        : "Kedaluwarsa"}
                  </span>
                  {inv.note && <span className="truncate">{inv.note}</span>}
                </p>
              </div>
              {inv.status === "AKTIF" && (
                <button
                  type="button"
                  onClick={() => copy(inv)}
                  title="Salin link"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
                >
                  {copiedId === inv.id ? (
                    <Check className="h-3.5 w-3.5 text-brand-dark" />
                  ) : (
                    <Copy className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
              <form
                action={async () => {
                  await deleteSalesInvite(inv.id);
                }}
              >
                <button
                  title="Hapus link"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
