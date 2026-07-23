"use client";

import { useActionState, useMemo, useState, type ReactNode } from "react";
import {
  updateProductGroup,
  deleteProductGroup,
  addHpModel,
  renameHpModel,
  deleteProduct,
} from "@/app/actions/tracker";
import { groupProductsByCode, type ProductLite } from "@/lib/product-code";
import { SubmitButton, PendingLabel } from "@/components/SubmitButton";
import {
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Trash2,
  Plus,
  X,
  Check,
} from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-2 py-1.5 text-sm";
const PER_PAGE = 12;

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Stabilo lime pada bagian teks yang cocok dengan pencarian (gaya CodePicker).
function markMatch(text: string, term: string): ReactNode {
  const t = term.trim();
  if (!t) return text;
  const lower = text.toLowerCase();
  const needle = t.toLowerCase();
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < text.length) {
    const idx = lower.indexOf(needle, i);
    if (idx === -1) {
      out.push(text.slice(i));
      break;
    }
    if (idx > i) out.push(text.slice(i, idx));
    out.push(
      <span
        key={key++}
        className="rounded bg-brand px-0.5 font-semibold text-neutral-900"
      >
        {text.slice(idx, idx + needle.length)}
      </span>,
    );
    i = idx + needle.length;
  }
  return out;
}

// Daftar Barang per KODE (menu Data admin) — tampil kaya dropdown order
// owner (kode + tipe HP yang cocok), tapi bisa diedit: harga & stok pusat
// per kode, plus tambah/rename/hapus tiap tipe HP.
export function ProductCodeManager({ products }: { products: ProductLite[] }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const groups = useMemo(() => groupProductsByCode(products), [products]);

  const term = q.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!term) return groups;
    return groups
      .map((g) => {
        const codeHit = (g.code ?? "").toLowerCase().includes(term);
        const typeHit = g.type.toLowerCase().includes(term);
        const members = g.members.filter(
          (m) =>
            codeHit ||
            typeHit ||
            m.model.toLowerCase().includes(term) ||
            m.name.toLowerCase().includes(term),
        );
        return { ...g, members };
      })
      .filter((g) => g.members.length > 0);
  }, [groups, term]);

  const pageCount = Math.max(1, Math.ceil(shown.length / PER_PAGE));
  const safePage = Math.min(page, pageCount - 1);
  const view = shown.slice(safePage * PER_PAGE, safePage * PER_PAGE + PER_PAGE);

  if (products.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada barang.</p>;
  }

  return (
    <div className="space-y-2">
      <div className="relative">
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
      <p className="text-xs text-neutral-400">
        {shown.length} kode barang
        {term ? ` cocok dengan "${q.trim()}"` : ""}
      </p>

      <div className="space-y-2">
        {shown.length === 0 ? (
          <p className="px-1 py-2 text-sm text-neutral-400">
            Barang tidak ditemukan.
          </p>
        ) : (
          view.map((g) => <CodeGroupCard key={g.key} group={g} term={term} />)
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-between border-t border-neutral-100 pt-2">
          <span className="text-xs text-neutral-400">
            {safePage * PER_PAGE + 1}–
            {Math.min((safePage + 1) * PER_PAGE, shown.length)} dari{" "}
            {shown.length}
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

function CodeGroupCard({
  group,
  term,
}: {
  group: ReturnType<typeof groupProductsByCode>[number];
  term: string;
}) {
  const [open, setOpen] = useState(false);
  const codeHit = term && (group.code ?? "").toLowerCase().includes(term);

  return (
    <div className="rounded-xl border border-neutral-200">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 p-3 text-left"
      >
        <span
          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold ${
            codeHit ? "bg-brand text-neutral-900" : "bg-neutral-900 text-white"
          }`}
        >
          {group.code ?? "-"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{group.type || "—"}</p>
          <p className="text-[11px] text-neutral-400">
            {group.members.length} tipe HP · {rupiah(group.price)} ·{" "}
            <span
              className={
                group.centralStock === 0
                  ? "font-semibold text-red-600"
                  : ""
              }
            >
              stok pusat {group.centralStock}
            </span>
          </p>
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t border-neutral-100 p-3">
          {group.code && (
            <>
              <GroupEditForm group={group} />
              {/* Di LUAR form edit — form bersarang itu HTML invalid, bikin
                  tombol hapus malah men-submit form edit. */}
              <DeleteGroupButton
                code={group.code}
                count={group.members.length}
              />
            </>
          )}
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-400">
              Tipe HP ({group.members.length})
            </p>
            <div className="divide-y divide-neutral-100">
              {group.members.map((m) => (
                <HpModelRow key={m.id} member={m} term={term} />
              ))}
            </div>
          </div>
          {group.code && <AddHpModel code={group.code} />}
        </div>
      )}
    </div>
  );
}

// Edit jenis + harga + stok pusat - berlaku ke semua tipe HP sekode, plus
// tombol hapus SATU kode sekaligus.
function GroupEditForm({
  group,
}: {
  group: ReturnType<typeof groupProductsByCode>[number];
}) {
  const action = updateProductGroup.bind(null, group.code!);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  return (
    <form action={formAction} className="rounded-lg bg-neutral-50 p-2.5">
      <label className="text-xs text-neutral-500">
        Jenis (semua sekode)
        <input
          name="type"
          defaultValue={group.type}
          placeholder="mis. Antigores Spy"
          className={`${inputCls} mt-1`}
        />
      </label>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">
          Harga
          <input
            name="price"
            type="number"
            min={0}
            defaultValue={group.price}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className="text-xs text-neutral-500">
          Stok pusat
          <input
            name="centralStock"
            type="number"
            min={0}
            defaultValue={group.centralStock}
            className={`${inputCls} mt-1`}
          />
        </label>
      </div>
      {state?.error && (
        <p className="mt-1 text-xs font-medium text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="mt-1 flex items-center gap-1 text-xs font-medium text-brand-dark">
          <Check className="h-3 w-3" /> Tersimpan.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="mt-2 w-full rounded-lg bg-neutral-900 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan jenis, harga & stok"}
      </button>
    </form>
  );
}

// Hapus seluruh kode (semua tipe HP) sekaligus, dengan konfirmasi.
function DeleteGroupButton({ code, count }: { code: string; count: number }) {
  return (
    <form
      action={async () => {
        await deleteProductGroup(code);
      }}
      onSubmit={(e) => {
        if (
          !window.confirm(
            `Hapus kode ${code} beserta ${count} tipe HP di dalamnya?`,
          )
        ) {
          e.preventDefault();
        }
      }}
    >
      <SubmitButton
        pendingText="Menghapus…"
        title={`Hapus kode ${code}`}
        className="flex w-full items-center justify-center gap-1 rounded-lg border border-red-300 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
      >
        <Trash2 className="h-3.5 w-3.5" /> Hapus kode {code} ({count} tipe HP)
      </SubmitButton>
    </form>
  );
}

function HpModelRow({
  member,
  term,
}: {
  member: { id: string; model: string; name: string };
  term: string;
}) {
  const [editing, setEditing] = useState(false);
  const action = renameHpModel.bind(null, member.id);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setEditing(false);
  }

  if (editing) {
    return (
      <form action={formAction} className="flex items-center gap-1.5 py-1.5">
        <input
          name="model"
          defaultValue={member.model}
          autoFocus
          className={inputCls}
        />
        <SubmitButton
          pendingText="…"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-white disabled:opacity-60"
        >
          <Check className="h-3.5 w-3.5" />
        </SubmitButton>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={pending}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1.5 text-sm">
      <span className="min-w-0 flex-1 break-words">
        {markMatch(member.model || member.name, term)}
      </span>
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Ganti nama tipe HP"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
      <form
        action={async () => {
          await deleteProduct(member.id);
        }}
        onSubmit={(e) => {
          if (!window.confirm(`Hapus tipe HP "${member.model}"?`)) {
            e.preventDefault();
          }
        }}
      >
        <SubmitButton
          pendingText="…"
          title={`Hapus ${member.model}`}
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </SubmitButton>
      </form>
    </div>
  );
}

function AddHpModel({ code }: { code: string }) {
  const action = addHpModel.bind(null, code);
  const [state, formAction] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  const [val, setVal] = useState("");
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.ok) setVal("");
  }
  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input
        name="model"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder="Tambah tipe HP, mis. IPHONE 15 PM"
        className={inputCls}
      />
      <SubmitButton
        pendingText="…"
        className="flex h-8 shrink-0 items-center gap-1 rounded-lg bg-neutral-900 px-2.5 text-xs font-semibold text-white disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" /> Tambah
      </SubmitButton>
      {state?.error && (
        <span className="text-xs font-medium text-red-600">{state.error}</span>
      )}
    </form>
  );
}
