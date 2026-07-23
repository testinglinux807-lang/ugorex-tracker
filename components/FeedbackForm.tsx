"use client";

import { useActionState, useState } from "react";
import { createFeedback } from "@/app/actions/tickets";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Kategori feedback owner — menentukan tujuan di server (createFeedback):
// KELUHAN → tiket, SARAN & BARANG → request bebas.
const KATEGORI = [
  { value: "KELUHAN", label: "Keluhan", hint: "Mis. Barang datang lecet" },
  { value: "SARAN", label: "Saran", hint: "Mis. Tambah model buat Samsung" },
  {
    value: "BARANG",
    label: "Ajukan barang",
    hint: "Mis. Minta dikunjungi sales / bawakan sampel",
  },
] as const;

// Konter pilihan untuk versi sales — sales mencatatkan feedback ATAS NAMA
// konter yang dia pegang (konter sering nyampein langsung, bukan lewat app).
export type FeedbackStoreOption = { id: string; name: string };

export function FeedbackForm({ stores }: { stores?: FeedbackStoreOption[] }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createFeedback(fd)) ?? null,
    null,
  );
  const [kategori, setKategori] =
    useState<(typeof KATEGORI)[number]["value"]>("KELUHAN");
  const active = KATEGORI.find((k) => k.value === kategori)!;
  const forSales = !!stores;

  return (
    <div className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-5">
      <h2 className="font-semibold">
        {forSales ? "Catat Feedback Konter" : "Kirim Feedback"}
      </h2>
      <p className="text-xs text-neutral-400">
        {forSales
          ? "Keluhan, saran, atau pengajuan barang yang disampaikan konter langsung ke kamu - dicatat atas nama konternya."
          : "Keluhan, saran, atau ajukan barang - semua dari satu pintu, langsung sampai ke sales & admin."}
      </p>
      {forSales && (
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-500">
          <span className="font-semibold text-neutral-900">Keluhan</span> masuk
          ke inbox Keluhan (menu Tugas) dan ikut tampil di tab Keluhan detail
          konter - satu catatan, bukan dobel.{" "}
          <span className="font-semibold text-neutral-900">Saran</span> &{" "}
          <span className="font-semibold text-neutral-900">Ajukan barang</span>{" "}
          ditangani di halaman ini.
        </p>
      )}

      <form action={formAction} className="space-y-3">
        {stores && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Konter <span className="text-neutral-900">*</span>
            </label>
            <select
              name="storeId"
              required
              defaultValue=""
              className={inputCls}
            >
              <option value="" disabled>
                Pilih konter…
              </option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Kategori <span className="text-neutral-900">*</span>
          </label>
          <select
            name="kategori"
            value={kategori}
            onChange={(e) =>
              setKategori(e.target.value as typeof kategori)
            }
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
            {forSales
              ? "Feedback konter tercatat, sudah masuk ke admin."
              : "Feedback terkirim ke sales & admin."}
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? (
            <PendingLabel text="Mengirim…" />
          ) : forSales ? (
            "Catat Feedback"
          ) : (
            "Kirim Feedback"
          )}
        </button>
      </form>
    </div>
  );
}
