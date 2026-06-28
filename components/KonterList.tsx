"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CreateOwnerForm } from "@/components/AccountForms";
import { Search, UserPlus, ChevronLeft, ChevronRight } from "lucide-react";

export type KonterItem = {
  id: string;
  name: string;
  area: string | null;
  salesName: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  hasOwner: boolean;
};

const PER_PAGE = 9;

export function KonterList({ stores }: { stores: KonterItem[] }) {
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
            <div key={s.id} className="rounded-lg border border-neutral-200 p-3">
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
                      Owner: {s.ownerName}{" "}
                      {s.ownerPhone ? `(${s.ownerPhone})` : ""}
                    </p>
                  )}
                </div>
                {s.hasOwner && (
                  <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-xs text-white">
                    Owner aktif
                  </span>
                )}
              </div>

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
