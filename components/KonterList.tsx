"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { updateStore } from "@/app/actions/tracker";
import { deleteStore } from "@/app/actions/tracker";
import { CreateOwnerForm } from "@/components/AccountForms";
import { DeleteWithConfirm } from "@/components/DataActions";
import { PendingLabel } from "@/components/SubmitButton";
import {
  Search,
  UserPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  X,
} from "lucide-react";

export type KonterItem = {
  id: string;
  name: string;
  area: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  salesId: string | null;
  salesName: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  hasOwner: boolean;
};

export type SalesOption = { id: string; name: string };

const PER_PAGE = 9;
const inputCls = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm";

// Form edit konter (muncul di dalam kartu)
function StoreEditForm({
  store,
  salesOptions,
  onDone,
}: {
  store: KonterItem;
  salesOptions: SalesOption[];
  onDone: () => void;
}) {
  const action = updateStore.bind(null, store.id);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  // Tutup form setelah tersimpan (reset saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) onDone();
  }

  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-2">
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required defaultValue={store.name} placeholder="Nama konter" className={inputCls} />
        <input name="area" defaultValue={store.area ?? ""} placeholder="Kecamatan / wilayah" className={inputCls} />
        <input name="ownerName" defaultValue={store.ownerName ?? ""} placeholder="Nama owner" className={inputCls} />
        <input name="ownerPhone" defaultValue={store.ownerPhone ?? ""} placeholder="No HP owner" className={inputCls} />
        <input name="lat" defaultValue={store.lat ?? ""} placeholder="Latitude" className={inputCls} />
        <input name="lng" defaultValue={store.lng ?? ""} placeholder="Longitude" className={inputCls} />
      </div>
      <input name="address" defaultValue={store.address ?? ""} placeholder="Alamat" className={inputCls} />
      <select name="salesId" defaultValue={store.salesId ?? ""} className={inputCls}>
        <option value="">— Sales penanggung jawab —</option>
        {salesOptions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      {state?.error && (
        <p className="text-xs font-medium text-red-600">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Perubahan"}
      </button>
    </form>
  );
}

// Kartu satu konter: info + akun owner + edit/hapus
function KonterCard({
  store: s,
  salesOptions,
}: {
  store: KonterItem;
  salesOptions: SalesOption[];
}) {
  const [editing, setEditing] = useState(false);
  return (
    <div className="rounded-lg border border-neutral-200 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/konter/${s.id}`}
            className="block truncate font-medium hover:underline"
          >
            {s.name}
          </Link>
          <p className="truncate text-xs text-neutral-500">
            {s.area ?? "—"} · Sales: {s.salesName ?? "—"}
          </p>
          {s.ownerName && (
            <p className="truncate text-xs text-neutral-500">
              Owner: {s.ownerName} {s.ownerPhone ? `(${s.ownerPhone})` : ""}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {s.hasOwner && (
            <span className="rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white">
              Owner aktif
            </span>
          )}
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            title={editing ? "Batal" : "Edit konter"}
            className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
              editing
                ? "border-neutral-900 bg-neutral-900 text-white"
                : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
            }`}
          >
            {editing ? (
              <X className="h-3.5 w-3.5" />
            ) : (
              <Pencil className="h-3.5 w-3.5" />
            )}
          </button>
          <DeleteWithConfirm
            action={deleteStore.bind(null, s.id)}
            title="Hapus konter"
            confirmText={`Hapus konter "${s.name}"? SEMUA datanya ikut terhapus: prospek/tracking, riwayat penjualan, tiket, order, dan akun owner-nya.`}
          />
        </div>
      </div>

      {editing && (
        <StoreEditForm
          store={s}
          salesOptions={salesOptions}
          onDone={() => setEditing(false)}
        />
      )}

      {!s.hasOwner && (
        <details className="mt-2">
          <summary className="flex cursor-pointer items-center gap-1 text-xs font-medium text-neutral-600">
            <UserPlus className="h-3.5 w-3.5" />
            Buatkan akun owner
          </summary>
          <div className="mt-2">
            <CreateOwnerForm storeId={s.id} />
          </div>
        </details>
      )}
    </div>
  );
}

export function KonterList({
  stores,
  salesOptions = [],
}: {
  stores: KonterItem[];
  salesOptions?: SalesOption[];
}) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () =>
      stores.filter((s) =>
        `${s.name} ${s.area ?? ""} ${s.ownerName ?? ""}`
          .toLowerCase()
          .includes(q.trim().toLowerCase()),
      ),
    [stores, q],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  return (
    <div>
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="text"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setPage(0);
          }}
          placeholder="Cari konter (nama / wilayah / owner)…"
          className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
        />
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-neutral-400">Konter tidak ditemukan.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {view.map((s) => (
            <KonterCard key={s.id} store={s} salesOptions={salesOptions} />
          ))}
        </div>
      )}

      {pageCount > 1 && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-3">
          <span className="text-xs text-neutral-400">
            {safePage * PER_PAGE + 1}–
            {Math.min((safePage + 1) * PER_PAGE, filtered.length)} dari{" "}
            {filtered.length} konter
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={safePage === 0}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-1 text-xs text-neutral-500">
              {safePage + 1}/{pageCount}
            </span>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
              disabled={safePage >= pageCount - 1}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
