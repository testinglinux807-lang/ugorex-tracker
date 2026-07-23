"use client";

import { useActionState } from "react";
import { setCsContact } from "@/app/actions/config";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Admin set kontak CS Ugorex (menu Data) — muncul di /profil semua owner
// toko sebagai "Hubungi CS", buat pertanyaan di luar urusan sales pemegang
// tokonya.
export function CsContactForm({
  name,
  phone,
}: {
  name: string;
  phone: string | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await setCsContact(fd)) ?? null,
    null,
  );

  return (
    <form action={formAction} className="space-y-2">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input
          name="name"
          defaultValue={name}
          placeholder="Nama CS, mis. CS Ugorex"
          className={inputCls}
        />
        <input
          name="phone"
          defaultValue={phone ?? ""}
          placeholder="No. WA CS, mis. 08123456789"
          className={inputCls}
        />
      </div>
      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Kontak CS disimpan.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan"}
      </button>
    </form>
  );
}
