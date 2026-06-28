"use client";

import { useActionState, useMemo, useState } from "react";
import { recordVisitMulti } from "@/app/actions/tracker";
import { STAGES, STAGE_LABEL, RESULTS, RESULT_LABEL } from "@/lib/constants";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const fieldCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const PER_PAGE = 6;

type Item = { checked: boolean; qty: number };

export function VisitForm({
  storeId,
  products,
}: {
  storeId: string;
  products: { id: string; name: string }[];
}) {
  const action = recordVisitMulti.bind(null, storeId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  const [items, setItems] = useState<Record<string, Item>>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const filtered = useMemo(
    () =>
      products.filter((p) =>
        p.name.toLowerCase().includes(q.trim().toLowerCase()),
      ),
    [products, q],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  const selectedIds = Object.keys(items).filter((id) => items[id]?.checked);

  function toggle(id: string) {
    setItems((s) => ({
      ...s,
      [id]: { checked: !s[id]?.checked, qty: s[id]?.qty ?? 0 },
    }));
  }
  function setQty(id: string, qty: number) {
    setItems((s) => ({ ...s, [id]: { checked: true, qty } }));
  }

  return (
    <form action={formAction} className="space-y-3">
      {/* Tahap / respon (1x untuk kunjungan) */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Tahap funnel
          </label>
          <select name="stage" defaultValue="AWARENESS" className={fieldCls}>
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Respon toko
          </label>
          <select name="result" defaultValue="NEUTRAL" className={fieldCls}>
            {RESULTS.map((r) => (
              <option key={r} value={r}>
                {RESULT_LABEL[r]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Pilih barang + qty per barang: search + pagination */}
      <div>
        <div className="mb-1 flex items-center justify-between">
          <label className="text-sm font-medium text-neutral-700">
            Barang & jumlah dikasih
          </label>
          <span className="text-xs text-neutral-400">
            {selectedIds.length} dipilih
          </span>
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(0);
            }}
            placeholder="Cari barang…"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          {view.length === 0 ? (
            <p className="px-1 py-2 text-sm text-neutral-400">
              Barang tidak ditemukan.
            </p>
          ) : (
            view.map((p) => {
              const it = items[p.id];
              const on = !!it?.checked;
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border px-3 py-2 ${
                    on ? "border-neutral-400 bg-neutral-50" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex min-w-0 cursor-pointer items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(p.id)}
                        className="h-4 w-4 shrink-0 accent-neutral-900"
                      />
                      <span className="truncate">{p.name}</span>
                    </label>
                    {on && (
                      <input
                        type="number"
                        min={0}
                        value={it?.qty ?? 0}
                        onChange={(e) =>
                          setQty(p.id, parseInt(e.target.value, 10) || 0)
                        }
                        placeholder="Jumlah"
                        aria-label={`Jumlah ${p.name}`}
                        className="w-24 shrink-0 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {pageCount > 1 && (
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-neutral-400">
              Hal {safePage + 1}/{pageCount}
            </span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-600 hover:bg-neutral-100 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
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

        {/* Kirim semua barang terpilih + qty-nya (lintas halaman/pencarian) */}
        {selectedIds.map((id) => (
          <span key={id}>
            <input type="hidden" name={`sel__${id}`} value={id} />
            <input type="hidden" name={`qty__${id}`} value={items[id]?.qty ?? 0} />
          </span>
        ))}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Catatan kunjungan <span className="text-neutral-900">*</span>
        </label>
        <input
          name="note"
          required
          placeholder="Mis. ditawarkan, owner tertarik minta sampel."
          className={fieldCls}
        />
      </div>

      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          Tersimpan ({state.count} barang). Stok & funnel diperbarui.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Menyimpan…" : "Catat Kunjungan"}
      </button>
    </form>
  );
}
