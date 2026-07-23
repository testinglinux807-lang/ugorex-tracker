"use client";

import { useActionState, useState } from "react";
import { createProductGroup } from "@/app/actions/tracker";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Tambah barang per KODE (menu Data admin): 1 kode + jenis + harga + stok +
// beberapa tipe HP sekaligus (satu per baris). Kode bisa yang sudah ada
// (autocomplete) - kalau begitu, tipe HP baru nyambung ke kode itu & stok
// ikut stok kode itu. Lihat app/actions/tracker.ts createProductGroup.
export function AddProductGroup({ codes }: { codes: string[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) =>
      (await createProductGroup(fd)) ?? null,
    null,
  );
  const [seen, setSeen] = useState(state);
  const [resetKey, setResetKey] = useState(0);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setResetKey((k) => k + 1);
  }

  return (
    <form key={resetKey} action={formAction} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-neutral-600">
          Kode mold <span className="text-neutral-900">*</span>
          <input
            name="code"
            required
            list="existing-codes"
            placeholder="mis. AA01"
            className={`${inputCls} mt-1 uppercase`}
          />
          <datalist id="existing-codes">
            {codes.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Jenis
          <input
            name="type"
            placeholder="mis. Antigores Spy"
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs font-medium text-neutral-600">
          Harga (Rp)
          <input
            name="price"
            type="number"
            min={0}
            placeholder="mis. 25000"
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Stok pusat
          <input
            name="centralStock"
            type="number"
            min={0}
            placeholder="mis. 100"
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
      <label className="block text-xs font-medium text-neutral-600">
        Tipe HP <span className="text-neutral-900">*</span>{" "}
        <span className="font-normal text-neutral-400">(satu per baris)</span>
        <textarea
          name="models"
          required
          rows={4}
          placeholder={"IPHONE 14 PM\nIPHONE 15+\nIPHONE 16+"}
          className={`${inputCls} mt-1`}
        />
      </label>
      <p className="text-[11px] text-neutral-400">
        Tiap baris = 1 tipe HP, jadi 1 barang di bawah kode itu. Kalau kodenya
        sudah ada, jenis/harga/stok ikut kode itu (isian di atas boleh
        dikosongkan).
      </p>

      {state?.error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Barang ditambahkan.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Tambah Barang"}
      </button>
    </form>
  );
}
