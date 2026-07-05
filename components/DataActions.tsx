"use client";

import { useActionState, useState } from "react";
import {
  updateProduct,
  deleteProduct,
} from "@/app/actions/tracker";
import {
  updateSalesAccount,
  deleteSalesAccount,
} from "@/app/actions/users";
import { UpdateProductPhotoForm } from "@/components/ProductPhoto";
import { SubmitButton, PendingLabel } from "@/components/SubmitButton";
import { Package, Pencil, Trash2, X } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Tombol hapus dengan konfirmasi browser
export function DeleteWithConfirm({
  action,
  confirmText,
  title,
}: {
  action: (formData: FormData) => void | Promise<unknown>;
  confirmText: string;
  title: string;
}) {
  return (
    <form
      action={async (fd) => {
        await action(fd);
      }}
      onSubmit={(e) => {
        if (!window.confirm(confirmText)) e.preventDefault();
      }}
    >
      <SubmitButton
        title={title}
        className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </SubmitButton>
    </form>
  );
}

function EditToggle({
  open,
  onClick,
  title,
}: {
  open: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={open ? "Batal" : title}
      className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
        open
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-300 text-neutral-600 hover:bg-neutral-100"
      }`}
    >
      {open ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
    </button>
  );
}

// Baris barang di menu Data: info + stok pusat + foto + edit + hapus
export function ProductRow({
  product,
}: {
  product: {
    id: string;
    name: string;
    price: number;
    description: string | null;
    imageUrl: string | null;
    centralStock: number;
  };
}) {
  const [editing, setEditing] = useState(false);
  const action = updateProduct.bind(null, product.id);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  // Tutup form setelah tersimpan (reset saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setEditing(false);
  }

  return (
    <div className="py-2">
      {/* Baris utama: cuma thumb + info + 2 tombol (Edit, Hapus) — sisanya
          (stok pusat, foto) pindah ke panel edit supaya tidak sempit di HP */}
      <div className="flex items-center justify-between gap-2 text-sm">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-9 w-9 shrink-0 rounded-lg border border-neutral-200 object-cover"
          />
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100">
            <Package className="h-4 w-4 text-neutral-300" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{product.name}</p>
          <p className="truncate text-xs text-neutral-400">
            {rupiah(product.price)}
          </p>
          <p
            className={`text-xs ${
              product.centralStock === 0
                ? "font-semibold text-red-600"
                : "text-neutral-500"
            }`}
          >
            Stok pusat: {product.centralStock}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <EditToggle
            open={editing}
            onClick={() => setEditing((v) => !v)}
            title="Edit barang"
          />
          <DeleteWithConfirm
            action={deleteProduct.bind(null, product.id)}
            title="Hapus barang"
            confirmText={`Hapus "${product.name}"? Tracking/prospek barang ini di semua konter ikut terhapus. Riwayat penjualan tetap ada.`}
          />
        </div>
      </div>

      {editing && (
        <div className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-2">
          <form action={formAction} className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <input
                name="name"
                required
                defaultValue={product.name}
                placeholder="Nama barang"
                className={inputCls}
              />
              <input
                name="price"
                type="number"
                min={0}
                defaultValue={product.price}
                placeholder="Harga (Rp)"
                className={inputCls}
              />
            </div>
            <input
              name="description"
              defaultValue={product.description ?? ""}
              placeholder="Deskripsi (opsional)"
              className={inputCls}
            />
            <div>
              <label className="mb-1 block text-xs text-neutral-500">
                Stok pusat
              </label>
              <input
                name="centralStock"
                type="number"
                min={0}
                defaultValue={product.centralStock}
                className={inputCls}
              />
            </div>
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

          <div className="border-t border-neutral-200 pt-2">
            <p className="mb-1 text-xs text-neutral-500">Foto barang</p>
            <UpdateProductPhotoForm productId={product.id} />
          </div>
        </div>
      )}
    </div>
  );
}

// Baris akun sales di menu Data: info + edit + hapus
export function SalesRow({
  user,
}: {
  user: { id: string; name: string; phone: string };
}) {
  const [editing, setEditing] = useState(false);
  const action = updateSalesAccount.bind(null, user.id);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setEditing(false);
  }

  return (
    <div className="py-2">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="min-w-0 truncate font-medium">{user.name}</span>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-neutral-400">{user.phone}</span>
          <EditToggle
            open={editing}
            onClick={() => setEditing((v) => !v)}
            title="Edit akun sales"
          />
          <DeleteWithConfirm
            action={deleteSalesAccount.bind(null, user.id)}
            title="Hapus akun sales"
            confirmText={`Hapus akun sales "${user.name}"? Konter yang dia pegang jadi tanpa sales (riwayat tetap ada).`}
          />
        </div>
      </div>

      {editing && (
        <form
          action={formAction}
          className="mt-2 space-y-2 rounded-lg bg-neutral-50 p-2"
        >
          <div className="grid grid-cols-2 gap-2">
            <input
              name="name"
              required
              defaultValue={user.name}
              placeholder="Nama sales"
              className={inputCls}
            />
            <input
              name="phone"
              required
              defaultValue={user.phone}
              placeholder="No HP (login)"
              className={inputCls}
            />
          </div>
          <input
            name="password"
            type="password"
            placeholder="Password baru (kosongkan kalau tetap)"
            className={inputCls}
          />
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
      )}
    </div>
  );
}
