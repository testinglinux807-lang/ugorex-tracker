"use client";

import { useActionState, useMemo, useState } from "react";
import { recordVisitMulti } from "@/app/actions/tracker";
import { STAGES, STAGE_LABEL, RESULTS, RESULT_LABEL } from "@/lib/constants";
import { groupProductsByCode } from "@/lib/product-code";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";

const fieldCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const PER_PAGE = 6;

type Item = { checked: boolean; qty: number };

// Catat kunjungan / funnel — barang dipilih per KODE mold (kaya dropdown
// order owner), bukan per tipe HP satu-satu (dulu bisa ratusan halaman).
// Tiap kode diwakili 1 produk (member pertama, lihat lib/product-code.ts) —
// stoknya masuk ke bucket yang sama dengan yang dibaca order/POS.
export function VisitForm({
  storeId,
  products,
}: {
  storeId: string;
  products: {
    id: string;
    name: string;
    code: string | null;
    hpModel: string | null;
  }[];
}) {
  const action = recordVisitMulti.bind(null, storeId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );

  // Kode → produk perwakilan + daftar tipe HP kompatibel (buat dicari & catatan)
  const codes = useMemo(() => {
    return groupProductsByCode(
      products.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.code,
        hpModel: p.hpModel,
        price: 0,
        centralStock: 0,
        description: null,
      })),
    ).map((g) => ({
      key: g.key,
      code: g.code,
      type: g.type,
      repId: g.members[0]?.id ?? "",
      models: g.members.map((m) => m.model || m.name),
    }));
  }, [products]);

  // qty di-key per KODE (key grup); submit pakai repId
  const [items, setItems] = useState<Record<string, Item>>({});
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      !term
        ? codes
        : codes.filter((c) =>
            `${c.code ?? ""} ${c.type} ${c.models.join(" ")}`
              .toLowerCase()
              .includes(term),
          ),
    [codes, term],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = filtered.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);
  const selectedKeys = Object.keys(items).filter((k) => items[k]?.checked);
  const byKey = useMemo(() => new Map(codes.map((c) => [c.key, c])), [codes]);

  function toggle(key: string) {
    setItems((s) => ({
      ...s,
      [key]: { checked: !s[key]?.checked, qty: s[key]?.qty ?? 0 },
    }));
  }
  function setQty(key: string, qty: number) {
    setItems((s) => ({ ...s, [key]: { checked: true, qty } }));
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

      {/* Pilih barang per KODE + qty: search + pagination */}
      <div>
        <div className="mb-1 flex items-center justify-between gap-2">
          <label className="text-sm font-medium text-neutral-700">
            Barang & jumlah yang dititip{" "}
            <span className="font-normal text-neutral-400">
              (bayar setelah laku)
            </span>
          </label>
          <span className="shrink-0 text-xs text-neutral-400">
            {selectedKeys.length} dipilih
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
            placeholder="Cari kode / tipe HP (mis. iPhone 13, AA16)…"
            className="w-full rounded-lg border border-neutral-300 py-2 pl-8 pr-3 text-sm"
          />
        </div>

        <div className="space-y-1">
          {view.length === 0 ? (
            <p className="px-1 py-2 text-sm text-neutral-400">
              Barang tidak ditemukan.
            </p>
          ) : (
            view.map((c) => {
              const it = items[c.key];
              const on = !!it?.checked;
              return (
                <div
                  key={c.key}
                  className={`rounded-lg border px-3 py-2 ${
                    on ? "border-neutral-400 bg-neutral-50" : "border-neutral-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(c.key)}
                        className="mt-0.5 h-4 w-4 shrink-0 accent-neutral-900"
                      />
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5">
                          {c.code && (
                            <span className="shrink-0 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                              {c.code}
                            </span>
                          )}
                          <span className="font-medium">{c.type || c.models[0]}</span>
                        </span>
                        <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">
                          Cocok {c.models.length} tipe:{" "}
                          {c.models.map((m, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              <span
                                className={
                                  term && m.toLowerCase().includes(term)
                                    ? "rounded bg-brand px-0.5 font-semibold text-neutral-900"
                                    : ""
                                }
                              >
                                {m}
                              </span>
                            </span>
                          ))}
                        </span>
                      </span>
                    </label>
                    {on && (
                      <input
                        type="number"
                        min={0}
                        value={it?.qty ?? 0}
                        onChange={(e) =>
                          setQty(c.key, parseInt(e.target.value, 10) || 0)
                        }
                        placeholder="Jumlah"
                        aria-label={`Jumlah ${c.code ?? c.type}`}
                        className="w-20 shrink-0 rounded-lg border border-neutral-300 px-2 py-1.5 text-sm"
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

        {/* Kirim produk perwakilan tiap kode terpilih + qty-nya (lintas
            halaman/pencarian) */}
        {selectedKeys.map((key) => {
          const repId = byKey.get(key)?.repId;
          if (!repId) return null;
          return (
            <span key={key}>
              <input type="hidden" name={`sel__${repId}`} value={repId} />
              <input
                type="hidden"
                name={`qty__${repId}`}
                value={items[key]?.qty ?? 0}
              />
            </span>
          );
        })}
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
        {pending ? <PendingLabel text="Menyimpan…" /> : "Catat Kunjungan"}
      </button>
    </form>
  );
}
