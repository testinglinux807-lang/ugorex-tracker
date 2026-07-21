"use client";

import Link from "next/link";
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
  ChevronDown,
  History,
  Landmark,
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
  setGudangRadius,
  deleteLemburSession,
  markKpiBonusPaid,
  unmarkKpiBonusPaid,
  markGudangSalaryPaid,
  unmarkGudangSalaryPaid,
} from "@/app/actions/payroll";
import { recordCommissionPayout } from "@/app/actions/users";

const rp = (n: number) => "Rp" + Math.round(n).toLocaleString("id-ID");
const jam = (n: number) =>
  n.toLocaleString("id-ID", { maximumFractionDigits: 2 });

type Employee = {
  id: string;
  name: string;
  phone: string;
  basePay: number;
  bankAccount: string | null;
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

type RecordedTotals = { fee: number; bonus: number; gudangSalary: number };

type Props = {
  monthLabel: string;
  period: string;
  isCurrentPeriod: boolean;
  today: string;
  sales: SalesPayrollRow[];
  gudang: GudangPayrollRow[];
  employees: Employee[];
  logs: LogItem[];
  lembur: LemburItem[];
  cfg: PayrollConfig;
  radiusKm: number;
  recorded: RecordedTotals;
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
          period={props.period}
          monthLabel={props.monthLabel}
          isCurrentPeriod={props.isCurrentPeriod}
        />
      )}
      {tab === "gudang" && (
        <GudangView
          rows={props.gudang}
          total={gudangTotal}
          monthLabel={props.monthLabel}
          period={props.period}
          isCurrentPeriod={props.isCurrentPeriod}
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
          recorded={props.recorded}
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

// Peringatan saat melihat bulan lampau — pengaturan (komisi, tarif, akun)
// selalu berlaku untuk SEKARANG, bukan bulan yang sedang dilihat.
function HistoryBanner({ monthLabel }: { monthLabel: string }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
      <History className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      <span>
        Melihat riwayat <b>{monthLabel}</b> - data di bawah dihitung ulang
        dari kondisi bulan itu, tapi pengaturan (persen komisi, tarif lembur,
        gaji pokok, akun) selalu memakai nilai <b>saat ini</b>, bukan yang
        berlaku waktu itu.
      </span>
    </div>
  );
}

type LunasFilter = "semua" | "lunas" | "belum";

function LunasFilterTabs({
  value,
  onChange,
  countLunas,
  countBelum,
}: {
  value: LunasFilter;
  onChange: (v: LunasFilter) => void;
  countLunas: number;
  countBelum: number;
}) {
  const opts: { key: LunasFilter; label: string }[] = [
    { key: "semua", label: `Semua (${countLunas + countBelum})` },
    { key: "belum", label: `Belum Lunas (${countBelum})` },
    { key: "lunas", label: `Lunas (${countLunas})` },
  ];
  return (
    <div className="flex flex-wrap gap-1.5">
      {opts.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            value === o.key
              ? "bg-neutral-900 text-white"
              : "bg-neutral-100 text-neutral-500 hover:bg-neutral-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ===== Sales (read-only) =====
function SalesView({
  rows,
  komisi,
  total,
  cfg,
  period,
  monthLabel,
  isCurrentPeriod,
}: {
  rows: SalesPayrollRow[];
  komisi: number;
  total: number;
  cfg: PayrollConfig;
  period: string;
  monthLabel: string;
  isCurrentPeriod: boolean;
}) {
  // Sisa gabungan (fee + bonus KPI belum dibayar) — sama dgn yang ditampilkan
  // per baris di SalesPaymentStatus.
  const outstanding = rows.reduce(
    (a, s) => a + s.feeOutstanding + (s.kpiHit && !s.bonusPaid ? s.bonus : 0),
    0,
  );
  const isLunas = (s: SalesPayrollRow) =>
    s.feeOutstanding === 0 && (!s.kpiHit || s.bonusPaid);
  const countLunas = rows.filter(isLunas).length;
  const countBelum = rows.length - countLunas;
  const [filter, setFilter] = useState<LunasFilter>("semua");
  const shownRows = rows.filter((s) =>
    filter === "semua" ? true : filter === "lunas" ? isLunas(s) : !isLunas(s),
  );
  return (
    <div className="space-y-4">
      {!isCurrentPeriod && <HistoryBanner monthLabel={monthLabel} />}
      <LunasFilterTabs
        value={filter}
        onChange={setFilter}
        countLunas={countLunas}
        countBelum={countBelum}
      />
      <Panel
        title="Payroll Sales"
        icon={Briefcase}
        note={
          <span className="inline-flex items-center gap-1">
            <Lock className="h-3 w-3" /> nama · level · omzet · komisi · KPI -
            otomatis dari sistem
          </span>
        }
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-semibold">Nama Sales</th>
                <th className="px-4 py-3 font-semibold">No. Rekening</th>
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
                <th className="px-4 py-3 font-semibold">
                  Status Pembayaran
                </th>
              </tr>
            </thead>
            <tbody>
              {shownRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-neutral-400">
                    {rows.length === 0
                      ? "Belum ada sales."
                      : "Tidak ada yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                shownRows.map((s) => (
                  <tr key={s.salesId} className="border-b border-neutral-100">
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={`/sales/${s.salesId}`}
                        className="hover:text-brand-dark hover:underline"
                      >
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <BankAccountInline bankAccount={s.bankAccount} />
                    </td>
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
                        <span className="inline-flex w-fit items-center rounded-full bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand-dark">
                          +{rp(s.bonus)}
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
                    <td className="px-4 py-3">
                      <SalesPaymentStatus row={s} period={period} />
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
                <td className="px-4 py-3 text-right tabular-nums">{rp(komisi)}</td>
                <td />
                <td className="px-4 py-3 text-right tabular-nums">{rp(total)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {outstanding > 0 ? (
                    <span className="text-amber-700">sisa {rp(outstanding)}</span>
                  ) : (
                    <span className="text-neutral-400">lunas</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-start gap-1.5 border-t border-neutral-200 px-5 py-3 text-xs text-neutral-400">
          <Wallet className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b className="text-neutral-500">Fee</b> (kumulatif semua waktu,
            boleh dicairkan sebagian) dan{" "}
            <b className="text-neutral-500">Bonus</b> (tetap, per bulan) di
            kolom Status Pembayaran statusnya{" "}
            <b className="text-neutral-500">terpisah</b> - mekanisme
            pencairannya beda. Kolom{" "}
            <b className="text-neutral-500">Komisi</b> = hitungan bulan ini.
          </span>
        </div>
      </Panel>

      <ConfigForm cfg={cfg} />
    </div>
  );
}

// No. rekening sales — read-only di tabel Payroll (biar admin gampang lihat
// buat transfer). Edit-nya di halaman detail sales (klik ikon pensil).
function BankAccountInline({ bankAccount }: { bankAccount: string | null }) {
  if (!bankAccount) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-neutral-400">
        <Landmark className="h-3 w-3" /> belum diisi
      </span>
    );
  }
  return <span className="text-xs text-neutral-600">{bankAccount}</span>;
}

// Badge status fee affiliator + tombol "Cairkan" (collapsed) atau form
// jumlah+catatan (expanded).
function FeePayoutInline({
  salesId,
  outstanding,
  paid,
}: {
  salesId: string;
  outstanding: number;
  paid: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const boundAction = recordCommissionPayout.bind(null, salesId);
  const [state, action, pending] = useActionState(
    async (_p: unknown, fd: FormData) => (await boundAction(fd)) ?? null,
    null,
  );

  const badge =
    outstanding > 0 ? (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
        <Wallet className="h-3 w-3" /> sisa {rp(outstanding)}
      </span>
    ) : paid > 0 ? (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-brand/20 px-2 py-0.5 text-xs font-semibold text-brand-dark">
        <CheckCircle2 className="h-3 w-3" /> lunas
      </span>
    ) : (
      <span className="inline-flex w-fit items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-400">
        belum ada
      </span>
    );

  if (!expanded) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {badge}
        {outstanding > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cairkan
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      {badge}
      <form action={action} className="flex flex-wrap items-center gap-1.5">
        <input
          name="amount"
          type="number"
          min={1}
          required
          defaultValue={outstanding}
          className="w-24 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
        />
        <input
          name="note"
          placeholder="catatan (opsional)"
          className="w-32 rounded-md border border-neutral-300 px-2 py-1 text-xs outline-none focus:border-neutral-900"
        />
        <button
          disabled={pending}
          className="rounded-md bg-neutral-900 px-2 py-1 text-[11px] font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {pending ? "…" : "Catat"}
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="text-[11px] text-neutral-400 hover:text-neutral-700"
        >
          batal
        </button>
      </form>
      {state && "error" in state && state.error && (
        <span className="text-[11px] text-red-600">{state.error}</span>
      )}
    </div>
  );
}

// Status pembayaran sales — dua baris rapi (label tetap 40px biar sejajar):
// Fee affiliator (kumulatif, boleh dicairkan sebagian) dan Bonus KPI (tetap,
// per bulan). Mekanismenya beda jadi tetap dipisah, tapi label & spacing-nya
// dirapikan biar gampang dibaca sekilas.
function SalesPaymentStatus({
  row: s,
  period,
}: {
  row: SalesPayrollRow;
  period: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <div className="flex items-start gap-2">
        <span className="w-10 shrink-0 pt-0.5 text-[11px] font-medium text-neutral-400">
          Fee
        </span>
        <div className="flex flex-col gap-0.5">
          <FeePayoutInline
            key={`${s.salesId}-${s.feeOutstanding}-${s.feePaid}`}
            salesId={s.salesId}
            outstanding={s.feeOutstanding}
            paid={s.feePaid}
          />
          <span className="tabular-nums text-[11px] text-neutral-400">
            total {rp(s.feePaid + s.feeOutstanding)} · cair {rp(s.feePaid)}
          </span>
        </div>
      </div>
      {s.kpiHit && (
        <div className="flex items-start gap-2 border-t border-neutral-100 pt-1.5">
          <span className="w-10 shrink-0 pt-0.5 text-[11px] font-medium text-neutral-400">
            Bonus
          </span>
          <KpiBonusStatus
            salesId={s.salesId}
            period={period}
            amount={s.bonus}
            paid={s.bonusPaid}
          />
        </div>
      )}
    </div>
  );
}

// Status bayar bonus KPI (per sales, per bulan). Belum → tombol "Tandai
// dibayar" (masuk buku kas). Sudah → label "dibayar" + "batal".
function KpiBonusStatus({
  salesId,
  period,
  amount,
  paid,
}: {
  salesId: string;
  period: string;
  amount: number;
  paid: boolean;
}) {
  const [, markAction, markPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await markKpiBonusPaid(fd)) ?? null,
    null,
  );
  const [, unmarkAction, unmarkPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await unmarkKpiBonusPaid(fd)) ?? null,
    null,
  );

  if (paid) {
    return (
      <form action={unmarkAction} className="flex items-center gap-1.5">
        <input type="hidden" name="salesId" value={salesId} />
        <input type="hidden" name="period" value={period} />
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand-dark">
          <CheckCircle2 className="h-3 w-3" /> dibayar
        </span>
        <button
          disabled={unmarkPending}
          className="text-[11px] text-neutral-400 underline hover:text-red-600 disabled:opacity-50"
          title="Batalkan status lunas - entri buku kas ikut terhapus"
        >
          batal
        </button>
      </form>
    );
  }
  return (
    <form action={markAction}>
      <input type="hidden" name="salesId" value={salesId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="amount" value={amount} />
      <button
        disabled={markPending}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-[11px] font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        title="Tandai bonus KPI dibayar - otomatis masuk buku kas"
      >
        {markPending ? "…" : "Tandai dibayar"}
      </button>
    </form>
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
  total,
  monthLabel,
  period,
  isCurrentPeriod,
  tarif,
  radiusKm,
}: {
  rows: GudangPayrollRow[];
  total: number;
  monthLabel: string;
  period: string;
  isCurrentPeriod: boolean;
  tarif: number;
  radiusKm: number;
}) {
  const countLunas = rows.filter((g) => g.salaryPaid).length;
  const countBelum = rows.length - countLunas;
  const [filter, setFilter] = useState<LunasFilter>("semua");
  const shownRows = rows.filter((g) =>
    filter === "semua" ? true : filter === "lunas" ? g.salaryPaid : !g.salaryPaid,
  );
  return (
    <div className="space-y-4">
      {!isCurrentPeriod && <HistoryBanner monthLabel={monthLabel} />}
      <LunasFilterTabs
        value={filter}
        onChange={setFilter}
        countLunas={countLunas}
        countBelum={countBelum}
      />
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-500">
                <th className="px-4 py-3 font-semibold">Nama</th>
                <th className="px-4 py-3 font-semibold">No. Rekening</th>
                <th className="px-4 py-3 text-right font-semibold">Gaji Pokok</th>
                <th className="px-4 py-3 text-right font-semibold">Jam Lembur</th>
                <th className="px-4 py-3 text-right font-semibold">Upah Lembur</th>
                <th className="px-4 py-3 text-right font-semibold">Potongan</th>
                <th className="px-4 py-3 text-right font-semibold">Total Gaji</th>
                <th className="px-4 py-3 font-semibold">Status Gaji</th>
              </tr>
            </thead>
            <tbody>
              {shownRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-neutral-400">
                    {rows.length === 0
                      ? "Belum ada karyawan gudang - tambah akun di bawah."
                      : "Tidak ada yang cocok dengan filter."}
                  </td>
                </tr>
              ) : (
                shownRows.map((g) => (
                  <tr key={g.userId} className="border-b border-neutral-100">
                    <td className="px-4 py-3 font-medium">{g.name}</td>
                    <td className="px-4 py-3">
                      <BankAccountInline bankAccount={g.bankAccount} />
                    </td>
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
                    <td className="px-4 py-3">
                      <GudangSalaryStatus
                        userId={g.userId}
                        period={period}
                        amount={g.total}
                        paid={g.salaryPaid}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
                <td colSpan={6} className="px-4 py-3">
                  TOTAL
                </td>
                <td className="px-4 py-3 text-right tabular-nums">{rp(total)}</td>
                <td className="px-4 py-3 tabular-nums">
                  {countBelum > 0 ? (
                    <span className="text-amber-700">{countBelum} belum</span>
                  ) : (
                    <span className="text-neutral-400">semua lunas</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 border-t border-neutral-200 px-5 py-3 text-xs text-neutral-400">
          <Wallet className="h-3.5 w-3.5" />
          Total gaji gudang otomatis tercatat ke Keuangan (kategori “Gaji
          Gudang”) - ikut update tiap ada lembur/potongan. “Status Gaji” cuma
          penanda + kirim notif ke karyawan, tidak dobel-catat ke buku kas.
        </div>
      </Panel>

      <GudangSettingsForm radiusKm={radiusKm} tarif={tarif} />
    </div>
  );
}

// Status gaji gudang per bulan — murni penanda + pemicu notifikasi (TIDAK
// dobel-catat ke buku kas, karena gaji gudang sudah otomatis tersinkron).
function GudangSalaryStatus({
  userId,
  period,
  amount,
  paid,
}: {
  userId: string;
  period: string;
  amount: number;
  paid: boolean;
}) {
  const [, markAction, markPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await markGudangSalaryPaid(fd)) ?? null,
    null,
  );
  const [, unmarkAction, unmarkPending] = useActionState(
    async (_p: unknown, fd: FormData) => (await unmarkGudangSalaryPaid(fd)) ?? null,
    null,
  );

  if (paid) {
    return (
      <form action={unmarkAction} className="flex items-center gap-1.5">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="period" value={period} />
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark">
          <CheckCircle2 className="h-3 w-3" /> dicairkan
        </span>
        <button
          disabled={unmarkPending}
          className="text-[11px] text-neutral-400 underline hover:text-red-600 disabled:opacity-50"
          title="Batalkan status dicairkan"
        >
          batal
        </button>
      </form>
    );
  }
  return (
    <form action={markAction}>
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="period" value={period} />
      <input type="hidden" name="amount" value={amount} />
      <button
        disabled={markPending}
        className="inline-flex w-fit items-center gap-1 rounded-md border border-neutral-300 px-2 py-0.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
        title="Tandai gaji dicairkan - karyawan dapat notifikasi"
      >
        {markPending ? "…" : "Tandai dicairkan"}
      </button>
    </form>
  );
}

// Setelan operasional gudang (tarif lembur + radius jangkauan) — kelola
// AKUN gudang (tambah/edit/hapus, link registrasi) sekarang di Data →
// Akun Gudang, bukan di sini lagi.
function GudangSettingsForm({
  radiusKm,
  tarif,
}: {
  radiusKm: number;
  tarif: number;
}) {
  return (
    <details className="ug-acc group rounded-2xl border border-neutral-200 bg-white">
      <summary className="flex cursor-pointer list-none items-center gap-2 p-5 [&::-webkit-details-marker]:hidden">
        <Settings2 className="h-4 w-4 text-neutral-500" />
        <h2 className="font-semibold">Setelan Gudang</h2>
        <ChevronDown className="ml-auto h-4 w-4 shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-3 border-t border-neutral-200 p-5 pt-4">
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
          di halaman Order. Tambah/edit/hapus akun gudang sekarang di{" "}
          <Link href="/data" className="underline hover:text-neutral-700">
            Data → Akun Gudang
          </Link>
          .
        </p>
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
                      {l.note || "-"}
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
  recorded,
}: {
  salesTotal: number;
  gudangTotal: number;
  grand: number;
  monthLabel: string;
  recorded: RecordedTotals;
}) {
  const recordedTotal = recorded.fee + recorded.bonus + recorded.gudangSalary;
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">
          Proyeksi gaji bulan ini (dihitung dari data, belum tentu sudah cair)
        </p>
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
      </div>

      <Panel
        title="Tercatat di Buku Kas"
        icon={Wallet}
        note={
          <Link
            href="/keuangan?jenis=keluar"
            className="inline-flex items-center gap-1 text-xs text-neutral-500 underline hover:text-neutral-800"
          >
            Lihat di Keuangan
          </Link>
        }
      >
        <div className="divide-y divide-neutral-100 px-5">
          <RecordedRow label="Fee affiliator dicairkan" value={recorded.fee} />
          <RecordedRow label="Bonus KPI dibayar" value={recorded.bonus} />
          <RecordedRow label="Gaji gudang" value={recorded.gudangSalary} />
        </div>
        <div className="flex items-center justify-between border-t border-neutral-200 px-5 py-3">
          <span className="text-sm font-semibold">Total tercatat</span>
          <span className="tabular-nums text-sm font-semibold">
            {rp(recordedTotal)}
          </span>
        </div>
        <p className="border-t border-neutral-200 px-5 py-3 text-xs text-neutral-400">
          Ini angka yang BENERAN sudah otomatis masuk buku kas ({monthLabel})
          — beda dari proyeksi di atas. Fee kecatat pas admin klik “Catat” di
          tab Sales, Bonus KPI pas “Tandai dibayar”, Gaji Gudang otomatis
          tiap ada lembur/potongan (tidak perlu diklik apa-apa).
        </p>
      </Panel>
    </div>
  );
}

function RecordedRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between py-2.5 text-sm">
      <span className="text-neutral-600">{label}</span>
      <span className="tabular-nums font-medium">
        {value > 0 ? rp(value) : <span className="text-neutral-300">Rp0</span>}
      </span>
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
