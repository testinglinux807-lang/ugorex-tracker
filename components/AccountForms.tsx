"use client";

import { useActionState } from "react";
import { createOwnerAccount, createSalesAccount } from "@/app/actions/users";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const btnCls =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60";

function Msg({ state }: { state: { error?: string; ok?: boolean } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
        Akun berhasil dibuat.
      </p>
    );
  return null;
}

export function CreateOwnerForm({ storeId }: { storeId: string }) {
  const action = createOwnerAccount.bind(null, storeId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  return (
    <form action={formAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input name="name" required placeholder="Nama owner" className={inputCls} />
      <input name="phone" required placeholder="No HP (login)" className={inputCls} />
      <input name="password" required placeholder="Password" className={inputCls} />
      <div className="sm:col-span-3">
        <Msg state={state} />
      </div>
      <button disabled={pending} className={`${btnCls} sm:col-span-3`}>
        {pending ? "Membuat..." : "Buat Akun Owner"}
      </button>
    </form>
  );
}

export function CreateSalesForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createSalesAccount(fd)) ?? null,
    null,
  );
  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input name="name" required placeholder="Nama sales" className={inputCls} />
      <input name="phone" required placeholder="No HP (login)" className={inputCls} />
      <input name="password" required placeholder="Password" className={inputCls} />
      <div className="sm:col-span-3">
        <Msg state={state} />
      </div>
      <button disabled={pending} className={`${btnCls} sm:col-span-3`}>
        {pending ? "Membuat..." : "Tambah Sales"}
      </button>
    </form>
  );
}
