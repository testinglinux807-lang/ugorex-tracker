"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { createTask } from "@/app/actions/tasks";
import { PendingLabel } from "@/components/SubmitButton";
import { Search } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// Form admin: beri tugas manual ke satu / banyak sales sekaligus — cari
// nama untuk memfilter daftar, centang yang dituju, atau "Pilih semua"
// untuk mengirim ke seluruh sales tanpa input satu-satu.
export function TaskAssignForm({
  salesList,
  stores,
}: {
  salesList: { id: string; name: string }[];
  stores: { id: string; name: string }[];
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createTask(fd)) ?? null,
    null,
  );

  const [sel, setSel] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");

  // Kosongkan pilihan setelah tugas terkirim (reset saat render, tanpa effect)
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setSel(new Set());
  }

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return salesList;
    return salesList.filter((s) => s.name.toLowerCase().includes(term));
  }, [salesList, q]);

  const allSelected = sel.size === salesList.length && salesList.length > 0;

  function toggle(id: string) {
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (salesList.length === 0) {
    return (
      <p className="text-sm text-neutral-400">
        Belum ada akun sales untuk diberi tugas.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-2">
      {/* Pilih sales tujuan: filter nama + centang, bisa lebih dari satu */}
      <div className="rounded-lg border border-neutral-300">
        <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2">
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs font-medium text-neutral-600">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={() =>
                setSel(
                  allSelected ? new Set() : new Set(salesList.map((s) => s.id)),
                )
              }
              className="h-3.5 w-3.5 accent-neutral-900"
            />
            Pilih semua
          </label>
          <span className="ml-auto shrink-0 text-xs text-neutral-400">
            {sel.size}/{salesList.length} dipilih
          </span>
        </div>
        <div className="relative border-b border-neutral-200">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cari sales…"
            className="w-full rounded-none border-0 py-2 pl-9 pr-3 text-sm outline-none"
          />
        </div>
        <div className="max-h-36 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-neutral-400">
              Tidak ada sales yang cocok.
            </p>
          ) : (
            filtered.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  checked={sel.has(s.id)}
                  onChange={() => toggle(s.id)}
                  className="h-3.5 w-3.5 accent-neutral-900"
                />
                <span className="truncate">{s.name}</span>
              </label>
            ))
          )}
        </div>
      </div>
      {[...sel].map((id) => (
        <input key={id} type="hidden" name="assignedToIds" value={id} />
      ))}

      <input
        name="title"
        required
        placeholder="Judul tugas (mis. Follow up Konter A)"
        className={inputCls}
      />
      <textarea
        name="note"
        rows={2}
        placeholder="Catatan (opsional)"
        className={inputCls}
      />
      <div className="grid grid-cols-2 gap-2">
        <select name="priority" defaultValue="NORMAL" className={inputCls}>
          <option value="NORMAL">Prioritas biasa</option>
          <option value="HIGH">Penting</option>
        </select>
        <input name="dueDate" type="date" className={inputCls} />
      </div>
      <select name="storeId" defaultValue="" className={inputCls}>
        <option value="">— Tanpa konter —</option>
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>

      {state?.error && (
        <p className="text-xs font-medium text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Tugas terkirim ke {state.count} sales.
        </p>
      )}

      <button
        type="submit"
        disabled={pending || sel.size === 0}
        className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? (
          <PendingLabel text="Mengirim…" />
        ) : sel.size === 0 ? (
          "Beri Tugas — pilih sales dulu"
        ) : sel.size === salesList.length ? (
          "Beri Tugas ke Semua Sales"
        ) : (
          `Beri Tugas ke ${sel.size} Sales`
        )}
      </button>
    </form>
  );
}
