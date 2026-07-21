"use client";

import { useState, useActionState } from "react";
import {
  Briefcase,
  Package,
  CalendarDays,
  BarChart3,
  Plus,
  Trash2,
  Lock,
  Settings2,
  CheckCircle2,
  Wallet,
  Clock,
  MapPin,
  Crosshair,
  ChevronDown,
} from "lucide-react";
import { fmtDate } from "@/lib/date";
import {
  LOG_LABEL,
  LOG_TYPES,
  type PayrollConfig,
  type SalesPayrollRow,
  type GudangPayrollRow,
} from "@/lib/payroll";
import {
  addLog,
  addLembur,
  deleteLog,
  setPayrollConfig,
  updateGudang,
  setGudangRadius,
  deleteLemburSession,
} from "@/app/actions/payroll";
import {
  createGudangAccount,
  deleteGudangAccount,
} from "@/app/actions/users";

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const jam = (n: number) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

type Employee = {
  id: string;
  name: string;
  phone: string;
  basePay: number;
  homeLat: number | null;
  homeLng: number | null;
};
type LogItem = {
  id: string;
  date: string;
  userName: string;
  type: string;
  amount: number;
  note: string | null;
};
type LemburItem = {
  id: string;
  userName: string;
  startAt: string;
  endAt: string | null;
  hours: number;
};

type Props = {
  monthLabel: string;
  today: string;
  sales: SalesPayrollRow[];
  gudang: GudangPayrollRow[];
  employees: Employee[];
  logs: LogItem[];
  lembur: LemburItem[];
  cfg: PayrollConfig;
  radiusKm: number;
};

type Tab = "sales" | "gudang" | "log" | "rekap";

const TABS: { key: Tab; label: string; icon: typeof Briefcase }[] = [
  { key: "sales", label: "Sales", icon: Briefcase },
  { key: "gudang", label: "Gudang", icon: Package },
  { key: "log", label: "Lembur & Potongan", icon: CalendarDays },
  { key: "rekap", label: "Rekap", icon: BarChart3 },
];

export function PayrollTabs(props: Props) {
  const [tab, setTab] = useState<Tab>("sales");

  const salesKomisi = props.sales.reduce((a, s) => a + s.komisi, 0);
  const salesTotal = props.sales.reduce((a, s) => a + s.total, 0);
  const gudangTotal = props.gudang.reduce((a, g) => a + g.total, 0);
  const grand = salesTotal + gudangTotal;

  return (
    <div>
      {/* Tab garis-bawah — konsisten dgn /order, Data, dll. */}
      <div className="-mx-1 mb-5 flex gap-1 overflow-x-auto border-b border-neutral-200 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                on
                  ? "border-neutral-900 text-neutral-900"
                  : "border-transparent text-neutral-500 hover:text-neutral-800"
              }`}
            >
              <Icon className="h-4 w-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "sales" && (
        <SalesView
          rows={props.sales}
          komisi={salesKomisi}
          total={salesTotal}
          cfg={props.cfg}
        />
      )}
      {tab === "gudang" && (
        <GudangView
          rows={props.gudang}
          employees={props.employees}
          total={gudangTotal}
          monthLabel={props.monthLabel}
          tarif={props.cfg.lemburTarif}
          radiusKm={props.radiusKm}
        />
      )}
      {tab === "log" && (
        <LogView
          logs={props.logs}
          lembur={props.lembur}
          employees={props.employees}
          today={props.today}
          monthLabel={props.monthLabel}
        />
      )}
      {tab === "rekap" && (
        <RekapView
          salesTotal={salesTotal}
          gudangTotal={gudangTotal}
          grand={grand}
          monthLabel={props.monthLabel}
        />
      )}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  note,
  children,
  collapsible = false,
  defaultOpen = false,
}: {
  title: string;
  icon: typeof Briefcase;
  note?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultOpen?: boolean;
}) {
  const heading = (
    <h2 className="flex items-center gap-2 font-semibold">
      <Icon className="h-4 w-4 text-neutral-500" />
      {title}
    </h2>
  );

  if (collapsible) {
    return (
      <details
        {...(defaultOpen ? { open: true } : {})}
        className="ug-acc group overflow-hidden rounded-2xl border border-neutral-200 bg-white"
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
          {heading}
          {note && (
            <div className="ml-auto text-xs text-neutral-400">{note}</div>
          )}
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180 ${
              note ? "" : "ml-auto"
            }`}
          />
        </summary>
        <div className="border-t border-neutral-200">{children}</div>
      </details>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-5 py-4">
        {heading}
        {note && <div className="text-xs text-neutral-400">{note}</div>}
      </div>
      {children}
    </div>
  );
}

// ===== Sales (read-only) =====
function SalesView({
  rows,
  komisi,
  total,
  cfg,
}: {
  rows: SalesPayrollRow[];
  komisi: number;
  total: number;
  cfg: PayrollConfig;
}) {
  return (
    <div className="space-y-4">
      <Panel
        title="Payroll Sales"
        icon={Briefcase}
        note={
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> nama · level · omzet · komisi · KPI —
            otomatis dari sistem
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-semibold">Nama Sales</th>
                <th className="px-4 py-3 font-semibold">Level</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Omzet Reorder
                </th>
                <th className="px-4 py-3 text-right font-semibold">% Komisi</th>
                <th className="px-4 py-3 text-right font-semibold">Komisi</th>
                <th className="px-4 py-3 font-semibold">KPI (bonus)</th>
                <th className="px-4 py-3 text-right font-semibold">
                  Total Gaji
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-neutral-400">
                    Belum ada sales.
                  </td>
                </tr>
              ) : (
                rows.map((s) => (
                  <tr key={s.salesId} className="border-b border-neutral-100">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="px-4 py-3 text-neutral-600">
                      Lv.{s.level} {s.levelName}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rp(s.omzet)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      {s.pct}%
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rp(s.komisi)}
                    </td>
                    <td className="px-4 py-3">
                      {s.kpiHit ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand-dark">
                          <CheckCircle2 className="h-3 w-3" />+{rp(s.bonus)}
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-400">
                          skor {s.score ?? 0} &lt; {cfg.kpiMin}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {rp(s.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
                <td colSpan={4} className="px-4 py-3">
                  TOTAL
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{rp(komisi)}</td>
                <td />
                <td className="px-4 py-3 text-right tabular-nums">{rp(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Panel>

      <ConfigForm cfg={cfg} />
    </div>
  );
}

function ConfigForm({ cfg }: { cfg: PayrollConfig }) {
  const [state, action, pending] = useActionState(
    async (_p: unknown, fd: FormData) => (await setPayrollConfig(fd)) ?? null,
    null,
  );
  return (
    <details className="ug-acc group rounded-2xl border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-4 w-4 text-neutral-500" />
        <h2 className="font-semibold">Setelan Bonus KPI Sales</h2>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
      </summary>
      <form action={action} className="border-t border-neutral-200 p-5 pt-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Bonus KPI (Rp)" name="bonusKpi" def={cfg.bonusKpi} />
          <Field label="Skor min KPI tercapai" name="kpiMin" def={cfg.kpiMin} />
        </div>
        {state && "ok" in state && state.ok && (
          <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-brand-dark">
            <CheckCircle2 className="h-4 w-4" /> Setelan tersimpan.
          </p>
        )}
        {state && "error" in state && state.error && (
          <p className="mt-3 text-sm text-red-600">{state.error}</p>
        )}
        <button
          disabled={pending}
          className="mt-3 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? "Menyimpan…" : "Simpan Setelan"}
        </button>
      </form>
    </details>
  );
}

function Field({
  label,
  name,
  def,
}: {
  label: string;
  name: string;
  def: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
      {label}
      <input
        name={name}
        type="number"
        min={0}
        defaultValue={def}
        className="rounded-lg border border-neutral-300 px-3 py-2 text-sm text-neutral-900 outline-none focus:border-neutral-900"
      />
    </label>
  );
}

// ===== Gudang =====
function GudangView({
  rows,
  employees,
  total,
  monthLabel,
  tarif,
  radiusKm,
}: {
  rows: GudangPayrollRow[];
  employees: Employee[];
  total: number;
  monthLabel: string;
  tarif: number;
  radiusKm: number;
}) {
  return (
    <div className="space-y-4">
      <Panel
        title="Payroll Gudang"
        icon={Package}
        note={
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> lembur & potongan diatur admin ·{" "}
            {rp(tarif)}/jam · {monthLabel}
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 text-right font-semibold">Gaji Pokok</th>
                <th className="px-4 py-3 text-right font-semibold">Jam Lembur</th>
                <th className="px-4 py-3 text-right font-semibold">Upah Lembur</th>
                <th className="px-4 py-3 text-right font-semibold">Potongan</th>
                <th className="px-4 py-3 text-right font-semibold">Total Gaji</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                    Belum ada karyawan gudang — tambah akun di bawah.
                  </td>
                </tr>
              ) : (
                rows.map((g) => (
                  <tr key={g.userId} className="border-b border-neutral-100">
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rp(g.basePay)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-neutral-500">
                      {jam(g.lemburJam)} jam
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {rp(g.upahLembur)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">
                      −{rp(g.potongan)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-semibold">
                      {rp(g.total)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
                <td colSpan={5} className="px-4 py-3">
                  TOTAL
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{rp(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-200 px-5 py-3 text-xs text-neutral-400">
          <Wallet className="h-3.5 w-3.5" />
          Total gaji gudang otomatis tercatat ke Keuangan (kategori “Gaji
          Gudang”) — ikut update tiap ada lembur/potongan.
        </div>
      </Panel>

      <GudangManager employees={employees} radiusKm={radiusKm} tarif={tarif} />
    </div>
  );
}

// Input koordinat gudang + tombol GPS "lokasi saya".
function GudangCoordFields({
  defLat,
  defLng,
}: {
  defLat?: number | null;
  defLng?: number | null;
}) {
  const [lat, setLat] = useState(defLat != null ? String(defLat) : "");
  const [lng, setLng] = useState(defLng != null ? String(defLng) : "");
  const [locating, setLocating] = useState(false);
  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  return (
    <>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
        Latitude gudang
        <input
          name="homeLat"
          value={lat}
          onChange={(e) => setLat(e.target.value)}
          inputMode="decimal"
          placeholder="-6.30"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
        Longitude gudang
        <input
          name="homeLng"
          value={lng}
          onChange={(e) => setLng(e.target.value)}
          inputMode="decimal"
          placeholder="107.30"
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
      </label>
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="inline-flex items-center gap-1.5 self-end rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-60"
      >
        <Crosshair className="h-4 w-4" />
        {locating ? "Mencari…" : "Lokasi saya"}
      </button>
    </>
  );
}

function GudangManager({
  employees,
  radiusKm,
  tarif,
}: {
  employees: Employee[];
  radiusKm: number;
  tarif: number;
}) {
  const [addState, addAction, addPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await createGudangAccount(fd)) ?? null,
    null,
  );
  return (
    <details className="ug-acc group rounded-2xl border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-4 w-4 text-neutral-500" />
        <h2 className="font-semibold">Kelola Karyawan Gudang</h2>
        <span className="ml-auto text-xs text-neutral-400">
          {employees.length} akun
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-neutral-200 p-5 pt-4">
        {/* Setelan gudang: tarif lembur + radius jangkauan */}
        <div className="grid gap-2 sm:grid-cols-2">
          <form
            action={async (fd) => {
              await setPayrollConfig(fd);
            }}
            className="flex flex-wrap items-end gap-2 rounded-xl bg-neutral-50 p-3"
          >
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-neutral-500">
              Tarif lembur (Rp/jam)
              <input
                name="lemburTarif"
                type="number"
                min={0}
                defaultValue={tarif}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold hover:bg-neutral-100">
              Simpan
            </button>
          </form>
          <form
            action={async (fd) => {
              await setGudangRadius(fd);
            }}
            className="flex flex-wrap items-end gap-2 rounded-xl bg-neutral-50 p-3"
          >
            <label className="flex flex-1 flex-col gap-1 text-xs font-medium text-neutral-500">
              Radius jangkauan gudang (km)
              <input
                name="radiusKm"
                type="number"
                min={1}
                step="0.5"
                defaultValue={radiusKm}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold hover:bg-neutral-100">
              Simpan
            </button>
          </form>
        </div>
        <p className="text-[11px] text-neutral-400">
          Toko di luar radius dari gudang terdekat ditandai “di luar jangkauan”
          di halaman Order.
        </p>

        {employees.map((e) => (
          <form
            key={e.id}
            action={async (fd) => {
              await updateGudang(fd);
            }}
            className="grid gap-2 rounded-xl border border-neutral-200 p-3 sm:grid-cols-2 lg:grid-cols-4"
          >
            <input type="hidden" name="id" value={e.id} />
            <div className="flex flex-col justify-center sm:col-span-2 lg:col-span-1">
              <p className="text-sm font-medium">{e.name}</p>
              <p className="text-xs text-neutral-400">{e.phone}</p>
              {e.homeLat == null && (
                <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                  <MapPin className="h-3 w-3" /> belum ada lokasi
                </p>
              )}
            </div>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Gaji pokok
              <input
                name="basePay"
                type="number"
                min={0}
                defaultValue={e.basePay}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <GudangCoordFields defLat={e.homeLat} defLng={e.homeLng} />
            <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
              <button className="rounded-lg border border-neutral-300 px-3 py-2 text-sm font-semibold hover:bg-neutral-100">
                Simpan
              </button>
              <button
                formAction={async (fd) => {
                  await deleteGudangAccount(fd);
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-sm text-red-600 hover:bg-red-50"
                title="Hapus akun gudang"
              >
                <Trash2 className="h-4 w-4" /> Hapus
              </button>
            </div>
          </form>
        ))}

        {/* Tambah akun gudang */}
        <form
          action={addAction}
          className="grid gap-2 rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-3 sm:grid-cols-2 lg:grid-cols-4"
        >
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
            Nama
            <input
              name="name"
              required
              placeholder="mis. Budi Santoso"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
            No HP (login)
            <input
              name="phone"
              required
              placeholder="08…"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
            Password
            <input
              name="password"
              required
              placeholder="min. 4 karakter"
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
            Gaji pokok
            <input
              name="basePay"
              type="number"
              min={0}
              defaultValue={0}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </label>
          <GudangCoordFields />
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              disabled={addPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" /> Tambah Akun Gudang
            </button>
          </div>
        </form>
        {addState && "error" in addState && addState.error && (
          <p className="text-sm text-red-600">{addState.error}</p>
        )}
        {addState && "ok" in addState && addState.ok && (
          <p className="text-sm font-medium text-brand-dark">
            Akun gudang dibuat.
          </p>
        )}
      </div>
    </details>
  );
}

// ===== Lembur (read-only) & Potongan (admin input) =====
function LogView({
  logs,
  lembur,
  employees,
  today,
  monthLabel,
}: {
  logs: LogItem[];
  lembur: LemburItem[];
  employees: Employee[];
  today: string;
  monthLabel: string;
}) {
  const [addState, addAction, addPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await addLog(fd)) ?? null,
    null,
  );
  const [lemState, lemAction, lemPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await addLembur(fd)) ?? null,
    null,
  );

  return (
    <div className="space-y-4">
      {/* Lembur — diatur admin (jam per tanggal) */}
      <Panel
        title="Lembur Karyawan"
        icon={Clock}
        note={`jam lembur diatur admin · ${monthLabel}`}
        collapsible
        defaultOpen
      >
        {employees.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">
            Tambah akun karyawan gudang dulu di tab Gudang.
          </p>
        ) : (
          <form
            action={lemAction}
            className="grid gap-3 border-b border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2 lg:grid-cols-5"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Tanggal
              <input
                name="date"
                type="date"
                defaultValue={today}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Karyawan
              <select
                name="userId"
                required
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Jam lembur
              <input
                name="jam"
                type="number"
                min={0.5}
                step={0.5}
                required
                placeholder="mis. 2.5"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Catatan
              <input
                name="note"
                placeholder="opsional…"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <div className="flex items-end">
              <button
                disabled={lemPending}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> Tambah
              </button>
            </div>
          </form>
        )}
        {lemState && "error" in lemState && lemState.error && (
          <p className="px-5 pt-3 text-sm text-red-600">{lemState.error}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 text-right font-semibold">Jam</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {lembur.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-400">
                    Belum ada lembur bulan ini.
                  </td>
                </tr>
              ) : (
                lembur.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtDate(l.startAt)}
                    </td>
                    <td className="px-4 py-3 font-medium">{l.userName}</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {jam(l.hours)} jam
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form
                        action={async (fd) => {
                          await deleteLemburSession(fd);
                        }}
                      >
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          className="text-red-600 hover:text-red-700"
                          title="Hapus lembur"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Potongan (telat / kasbon / absen) — admin input */}
      <Panel
        title="Potongan"
        icon={CalendarDays}
        note="telat · kasbon · absen (dicatat admin)"
        collapsible
      >
        {employees.length === 0 ? (
          <p className="px-5 py-6 text-sm text-neutral-400">
            Tambah akun karyawan gudang dulu di tab Gudang.
          </p>
        ) : (
          <form
            action={addAction}
            className="grid gap-3 border-b border-neutral-200 bg-neutral-50 p-5 sm:grid-cols-2 lg:grid-cols-6"
          >
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Tanggal
              <input
                name="date"
                type="date"
                defaultValue={today}
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Karyawan
              <select
                name="userId"
                required
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              >
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Jenis
              <select
                name="type"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              >
                {LOG_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {LOG_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500">
              Jumlah (Rp)
              <input
                name="amount"
                type="number"
                min={1}
                required
                placeholder="0"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-medium text-neutral-500 sm:col-span-2 lg:col-span-1">
              Catatan
              <input
                name="note"
                placeholder="opsional…"
                className="rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
              />
            </label>
            <div className="flex items-end">
              <button
                disabled={addPending}
                className="inline-flex h-[38px] items-center gap-1.5 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" /> Tambah
              </button>
            </div>
          </form>
        )}
        {addState && "error" in addState && addState.error && (
          <p className="px-5 pt-3 text-sm text-red-600">{addState.error}</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-semibold">Tanggal</th>
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">Jenis</th>
                <th className="px-4 py-3 text-right font-semibold">Jumlah</th>
                <th className="px-4 py-3 font-semibold">Catatan</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-neutral-400">
                    Belum ada potongan bulan ini.
                  </td>
                </tr>
              ) : (
                logs.map((l) => (
                  <tr key={l.id} className="border-b border-neutral-100">
                    <td className="px-4 py-3 whitespace-nowrap">
                      {fmtDate(l.date)}
                    </td>
                    <td className="px-4 py-3 font-medium">{l.userName}</td>
                    <td className="px-4 py-3">
                      <LogBadge type={l.type} />
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-red-600">
                      −{rp(l.amount)}
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
                      {l.note || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form
                        action={async (fd) => {
                          await deleteLog(fd);
                        }}
                      >
                        <input type="hidden" name="id" value={l.id} />
                        <button
                          className="text-red-600 hover:text-red-700"
                          title="Hapus"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </form>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}

function LogBadge({ type }: { type: string }) {
  const cls =
    type === "TELAT"
      ? "bg-amber-100 text-amber-700"
      : type === "KASBON"
        ? "bg-blue-100 text-blue-700"
        : "bg-red-100 text-red-700";
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {LOG_LABEL[type as keyof typeof LOG_LABEL] ?? type}
    </span>
  );
}

// ===== Rekap =====
function RekapView({
  salesTotal,
  gudangTotal,
  grand,
  monthLabel,
}: {
  salesTotal: number;
  gudangTotal: number;
  grand: number;
  monthLabel: string;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <RkCard label="Tim Sales" value={salesTotal} icon={Briefcase} />
      <RkCard label="Tim Gudang" value={gudangTotal} icon={Package} />
      <div className="rounded-2xl border border-neutral-900 bg-neutral-900 p-5 text-white">
        <p className="text-sm font-medium text-neutral-400">
          Total Pengeluaran Gaji · {monthLabel}
        </p>
        <p className="mt-1.5 tabular-nums text-2xl font-semibold text-brand">
          {rp(grand)}
        </p>
      </div>
    </div>
  );
}

function RkCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Briefcase;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-5">
      <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-500">
        <Icon className="h-4 w-4" /> {label}
      </p>
      <p className="mt-1.5 tabular-nums text-2xl font-semibold text-neutral-900">
        {rp(value)}
      </p>
    </div>
  );
}
