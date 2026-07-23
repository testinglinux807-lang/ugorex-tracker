"use client";

import { useActionState, useState } from "react";
import { createStaffFeedback } from "@/app/actions/staff-feedback";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Kategori feedback sales ke admin — istilahnya sama dengan feedback konter
// (lib/feedback-kind.ts), cuma contohnya disesuaikan sudut pandang sales.
const KATEGORI = [
  {
    value: "KELUHAN",
    label: "Keluhan",
    hint: "Mis. Motor dinas belum diservis",
  },
  { value: "SARAN", label: "Saran", hint: "Mis. Rute kunjungan dipecah 2 hari" },
  {
    value: "BARANG",
    label: "Ajukan barang",
    hint: "Mis. Minta stok sampel buat area Klari",
  },
] as const;

export function StaffFeedbackForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) =>
      (await createStaffFeedback(fd)) ?? null,
    null,
  );
  const [kind, setKind] = useState<(typeof KATEGORI)[number]["value"]>("KELUHAN");
  const active = KATEGORI.find((k) => k.value === kind)!;

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="font-semibold">Kirim ke Admin</h2>
      <p className="text-xs text-neutral-400">
        Keluhan, saran, atau pengajuan barang buat kerjaan kamu sendiri - bukan
        atas nama konter. Langsung masuk ke admin.
      </p>

      <form action={formAction} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Kategori <span className="text-neutral-900">*</span>
          </label>
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className={inputCls}
          >
            {KATEGORI.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Judul <span className="text-neutral-900">*</span>
          </label>
          <input
            name="subject"
            required
            placeholder={active.hint}
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Detail <span className="text-neutral-900">*</span>
          </label>
          <textarea
            name="message"
            required
            rows={4}
            placeholder="Jelaskan selengkap mungkin…"
            className={inputCls}
          />
        </div>

        {state?.error && (
          <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            Terkirim ke admin. Balasannya muncul di kartu riwayat.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <PendingLabel text="Mengirim…" /> : "Kirim ke Admin"}
        </button>
      </form>
    </div>
  );
}
