"use client";

import { useActionState, useRef, useState } from "react";
import Link from "next/link";
import { saveFinanceEntry, deleteFinanceEntry } from "@/app/actions/finance";
import {
  FINANCE_CATEGORIES,
  FINANCE_TYPE_LABEL,
  type FinanceType,
} from "@/lib/constants";
import { rupiah } from "@/lib/format";
import { fmtDate } from "@/lib/date";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { SubmitButton } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

export type FinanceRow = {
  id: string;
  type: FinanceType;
  amount: number;
  category: string | null;
  note: string;
  date: string; // ISO
  createdByName: string | null;
  auto: boolean; // true = pemasukan otomatis dari order lunas (terkunci)
};

// Format YYYY-MM-DD (WIB) untuk value input type=date.
function dateInputWib(iso?: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(iso ? new Date(iso) : new Date());
}

// Pencatat keuangan (admin, menu Keuangan): buku kas pemasukan & pengeluaran.
export function FinanceManager({
  entries,
  filter = "ALL",
  page = 1,
  totalPages = 1,
}: {
  entries: FinanceRow[];
  filter?: "ALL" | FinanceType;
  page?: number;
  totalPages?: number;
}) {
  const [type, setType] = useState<FinanceType>("EXPENSE");
  // Catatan yang sedang diedit (null = mode tambah baru).
  const [editing, setEditing] = useState<FinanceRow | null>(null);
  // Naikkan tiap simpan/batal untuk me-reset input tak-terkontrol.
  const [formKey, setFormKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);

  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => {
      const res = (await saveFinanceEntry(fd)) ?? null;
      // Setelah tersimpan: keluar dari mode edit & kosongkan form.
      if (res?.ok) {
        setEditing(null);
        setFormKey((k) => k + 1);
      }
      return res;
    },
    null,
  );

  function startEdit(e: FinanceRow) {
    setEditing(e);
    setType(e.type);
    setFormKey((k) => k + 1);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditing(null);
    setFormKey((k) => k + 1);
  }

  const shown =
    filter === "ALL" ? entries : entries.filter((e) => e.type === filter);

  const income = type === "INCOME";
  const isEditing = editing !== null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:items-start">
      {/* Kolom kiri: form input (sticky di desktop) */}
      <form
        ref={formRef}
        key={`${editing?.id ?? "new"}:${formKey}`}
        action={formAction}
        className={`space-y-2 rounded-xl border bg-white p-4 lg:sticky lg:top-20 ${
          isEditing ? "border-brand" : "border-neutral-200"
        }`}
      >
        {/* Judul form + tombol batal saat mode edit */}
        {isEditing && (
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-neutral-900">
              Edit catatan
            </span>
            <button
              type="button"
              onClick={cancelEdit}
              className="flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100"
            >
              <X className="h-3.5 w-3.5" />
              Batal
            </button>
          </div>
        )}

        {/* id catatan yang diedit (kosong = tambah baru) */}
        <input type="hidden" name="id" value={editing?.id ?? ""} />

        {/* Pilih jenis: pemasukan / pengeluaran */}
        <div className="grid grid-cols-2 gap-2">
          {(["EXPENSE", "INCOME"] as const).map((t) => {
            const on = type === t;
            const inc = t === "INCOME";
            return (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold ${
                  on
                    ? inc
                      ? "border-brand bg-brand text-neutral-900"
                      : "border-neutral-900 bg-neutral-900 text-white"
                    : "border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                }`}
              >
                {inc ? (
                  <ArrowDownLeft className="h-4 w-4" />
                ) : (
                  <ArrowUpRight className="h-4 w-4" />
                )}
                {FINANCE_TYPE_LABEL[t]}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="type" value={type} />

        <div className="grid grid-cols-2 gap-2">
          <input
            name="amount"
            type="number"
            min={1}
            required
            defaultValue={editing?.amount ?? ""}
            placeholder="Jumlah (Rp)"
            className={inputCls}
          />
          <input
            name="date"
            type="date"
            defaultValue={dateInputWib(editing?.date)}
            className={inputCls}
          />
          <input
            name="category"
            list="finance-cat"
            defaultValue={editing?.category ?? ""}
            placeholder="Kategori (opsional)"
            className={`${inputCls} col-span-2`}
          />
          <datalist id="finance-cat">
            {FINANCE_CATEGORIES[type].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input
            name="note"
            required
            defaultValue={editing?.note ?? ""}
            placeholder={
              income
                ? "Keterangan, mis. Profit order #123"
                : "Keterangan, mis. Beli antigores dari China"
            }
            className={`${inputCls} col-span-2`}
          />
        </div>

        {state?.error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            Catatan tersimpan.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className={`w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-60 ${
            income
              ? "bg-brand text-neutral-900 hover:bg-brand-dark hover:text-white"
              : "bg-neutral-900 text-white hover:bg-neutral-800"
          }`}
        >
          {pending
            ? "Menyimpan…"
            : isEditing
              ? "Simpan perubahan"
              : `Catat ${FINANCE_TYPE_LABEL[type]}`}
        </button>
      </form>

      {/* Kolom kanan: riwayat transaksi (lebih lebar di desktop) */}
      <div className="rounded-xl border border-neutral-200 bg-white p-4 lg:col-span-2">
        <h2 className="mb-3 text-sm font-semibold text-neutral-500">
          Riwayat transaksi
        </h2>
        {shown.length > 0 ? (
          <div>
            {/* Header kolom — desktop saja, biar terbaca seperti tabel kas */}
            <div className="hidden gap-3 border-b border-neutral-200 px-1 pb-2 text-xs font-medium uppercase tracking-wide text-neutral-400 lg:grid lg:grid-cols-[minmax(0,1fr)_10rem_8rem_auto_auto] lg:items-center">
              <span>Keterangan</span>
              <span>Kategori</span>
              <span>Tanggal</span>
              <span className="text-right">Jumlah</span>
              <span />
            </div>
            <ul className="divide-y divide-neutral-100">
              {shown.map((e) => {
                const inc = e.type === "INCOME";
                const tgl = fmtDate(e.date, {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                });
                return (
                  <li
                    key={e.id}
                    className="flex items-center gap-3 py-2.5 text-sm lg:grid lg:grid-cols-[minmax(0,1fr)_10rem_8rem_auto_auto] lg:items-center lg:px-1"
                  >
                    {/* Keterangan (+ meta ringkas di mobile) */}
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                          inc
                            ? "bg-brand/25 text-brand-dark"
                            : "bg-neutral-100 text-neutral-500"
                        }`}
                      >
                        {inc ? (
                          <ArrowDownLeft className="h-4 w-4" />
                        ) : (
                          <ArrowUpRight className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-neutral-900">
                          {e.note}
                        </p>
                        {/* Mobile: kategori · tanggal · pencatat jadi satu baris */}
                        <p className="truncate text-xs text-neutral-400 lg:hidden">
                          {e.category ? `${e.category} · ` : ""}
                          {tgl}
                          {e.createdByName ? ` · ${e.createdByName}` : ""}
                        </p>
                        {/* Desktop: pencatat kecil di bawah keterangan */}
                        {e.createdByName && (
                          <p className="hidden truncate text-xs text-neutral-400 lg:block">
                            {e.createdByName}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Kategori — kolom desktop */}
                    <span className="hidden truncate text-xs text-neutral-500 lg:block">
                      {e.category || "—"}
                    </span>

                    {/* Tanggal — kolom desktop */}
                    <span className="hidden text-xs text-neutral-500 lg:block">
                      {tgl}
                    </span>

                    {/* Jumlah */}
                    <span
                      className={`shrink-0 text-right font-semibold lg:justify-self-end ${
                        inc ? "text-brand-dark" : "text-neutral-900"
                      }`}
                    >
                      {inc ? "+" : "−"}
                      {rupiah(e.amount)}
                    </span>

                    {/* Aksi: edit + hapus — entri otomatis dari order
                        terkunci (mengikuti data ordernya) */}
                    <div className="flex shrink-0 items-center gap-1.5 lg:justify-self-end">
                      {e.auto ? (
                        <span
                          title="Tercatat otomatis dari order lunas — mengikuti data ordernya"
                          className="rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] font-medium text-neutral-400"
                        >
                          otomatis
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => startEdit(e)}
                            title="Edit catatan"
                            className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <form action={deleteFinanceEntry.bind(null, e.id)}>
                            <SubmitButton
                              pendingText="…"
                              title="Hapus catatan"
                              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </SubmitButton>
                          </form>
                        </>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-neutral-400">
            Belum ada catatan.
          </p>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-3 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm">
            <span className="text-neutral-500">
              Halaman {page} dari {totalPages}
            </span>
            <div className="flex gap-2">
              <PageLink page={page - 1} disabled={page <= 1}>
                <ChevronLeft className="h-4 w-4" />
                Sebelumnya
              </PageLink>
              <PageLink page={page + 1} disabled={page >= totalPages}>
                Berikutnya
                <ChevronRight className="h-4 w-4" />
              </PageLink>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Tombol navigasi halaman — nonaktif di ujung.
function PageLink({
  page,
  disabled,
  children,
}: {
  page: number;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const cls =
    "inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium";
  if (disabled) {
    return (
      <span
        className={`${cls} cursor-not-allowed border-neutral-200 text-neutral-300`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      href={`/keuangan?page=${page}`}
      scroll={false}
      className={`${cls} border-neutral-300 text-neutral-700 hover:bg-neutral-100`}
    >
      {children}
    </Link>
  );
}
