// Laporan keuangan tahunan 12 kolom bulan (halaman /keuangan, admin) —
// Laba Rugi, Neraca, dan Arus Kas, mengikuti kerangka Financial Statement
// Template (Income Statement / Balance Sheet / Cash Flow). Semua angka
// dihitung dari buku kas FinanceEntry; baris yang datanya belum pernah
// dicatat (mis. depresiasi, pajak) otomatis 0 — admin cukup mencatatnya
// di buku kas dengan kategori baku (lib/constants.ts FINANCE_CATEGORIES)
// dan laporan mengambilnya lewat pencocokan kata kunci di bawah.
//
// Catatan akurasi: Kas, Modal, dan Laba Ditahan akurat historis (kumulatif
// buku kas per akhir bulan, zona WIB). Piutang & Persediaan tidak punya
// riwayat — hanya diisi snapshot hari ini di kolom bulan berjalan.

import { wibYm, type EntryLite } from "./finance-report";

export const STATEMENT_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

export type StatementRow = {
  label: string;
  values: (number | null)[] | null; // 12 kolom; null cell = "—"; null baris = judul seksi
  style?: "total" | "head"; // total = baris tebal; head = judul seksi
};

export type Statement = StatementRow[];

export type FinanceStatements = {
  year: number;
  labaRugi: Statement;
  neraca: Statement;
  arusKas: Statement;
};

// ===== Klasifikasi kategori buku kas → baris laporan (kata kunci, biar
// kategori ketikan bebas admin tetap terpetakan) =====

type ExpenseGroup =
  | "hpp"
  | "iklan"
  | "bank"
  | "perlengkapan"
  | "platform"
  | "depresiasi"
  | "bunga"
  | "pajak"
  | "operasional";

function classifyExpense(category: string | null): ExpenseGroup {
  const c = (category ?? "").toLowerCase();
  if (/beli barang|hpp|cogs|ongkir|impor|freight/.test(c)) return "hpp";
  if (/iklan|ads|advertis|promosi/.test(c)) return "iklan";
  if (/bank/.test(c)) return "bank";
  if (/perlengkapan|supply|supplies|atk/.test(c)) return "perlengkapan";
  if (/platform|midtrans/.test(c)) return "platform";
  if (/depresiasi|penyusutan/.test(c)) return "depresiasi";
  if (/bunga|interest/.test(c)) return "bunga";
  if (/pajak|tax/.test(c)) return "pajak";
  return "operasional"; // gaji, sewa, operasional, lainnya
}

// Pemasukan kategori modal (setoran pemilik) bukan pendapatan — masuk
// ekuitas di Neraca & aktivitas pendanaan di Arus Kas, tidak ikut Laba Rugi.
function isModal(category: string | null): boolean {
  return /modal|setoran/i.test(category ?? "");
}

// Label baris mengikuti istilah Financial Statement Template (English);
// penjelasan Indonesia cukup di catatan kaki komponen.
const EXPENSE_LABEL: Record<ExpenseGroup, string> = {
  hpp: "Cost of Goods Sold",
  iklan: "Advertising Expense",
  bank: "Bank Administration",
  perlengkapan: "Supply Expenses",
  platform: "Platform Fee",
  depresiasi: "Depreciation Expenses",
  bunga: "Interest Expense",
  pajak: "Tax",
  operasional: "Operating Expenses (gaji, sewa, dll.)",
};

const zeros = () => Array<number>(12).fill(0);

export function financeStatements(
  entries: EntryLite[],
  opts: {
    year: number;
    piutang: number; // snapshot piutang hari ini (order terkirim belum dibayar)
    persediaan: number; // snapshot nilai stok pusat hari ini
    now?: Date;
  },
): FinanceStatements {
  const { year, piutang, persediaan } = opts;
  const now = opts.now ?? new Date();
  const nowYm = wibYm(now);
  const ymOf = (i: number) => `${year}-${String(i + 1).padStart(2, "0")}`;
  // Indeks bulan terakhir yang sudah berjalan di tahun ini; -1 = tahun depan
  // semua, 11 = tahun lampau penuh.
  const lastIdx =
    nowYm >= `${year}-12` ? 11 : nowYm < `${year}-01` ? -1 : Number(nowYm.slice(5)) - 1;

  // ===== Agregasi per bulan tahun terpilih + kumulatif s/d akhir tiap bulan =====
  const penjualan = zeros(); // pemasukan non-modal
  const modalMasuk = zeros();
  const beban: Record<ExpenseGroup, number[]> = {
    hpp: zeros(), iklan: zeros(), bank: zeros(), perlengkapan: zeros(),
    platform: zeros(), depresiasi: zeros(), bunga: zeros(), pajak: zeros(),
    operasional: zeros(),
  };
  // Kumulatif seluruh riwayat (lintas tahun) per kunci bulan — untuk saldo
  // kas, modal, dan laba ditahan di akhir tiap bulan.
  const deltaByYm = new Map<
    string,
    { kas: number; modal: number; laba: number }
  >();

  for (const e of entries) {
    const ym = wibYm(e.date);
    const d = deltaByYm.get(ym) ?? { kas: 0, modal: 0, laba: 0 };
    if (e.type === "INCOME") {
      d.kas += e.amount;
      if (isModal(e.category)) d.modal += e.amount;
      else d.laba += e.amount;
    } else {
      d.kas -= e.amount;
      d.laba -= e.amount;
    }
    deltaByYm.set(ym, d);

    if (ym.slice(0, 4) === String(year)) {
      const i = Number(ym.slice(5)) - 1;
      if (e.type === "INCOME") {
        if (isModal(e.category)) modalMasuk[i] += e.amount;
        else penjualan[i] += e.amount;
      } else {
        beban[classifyExpense(e.category)][i] += e.amount;
      }
    }
  }

  // Saldo kumulatif di akhir bulan i tahun terpilih
  const cum = (pick: (d: { kas: number; modal: number; laba: number }) => number) => {
    const perMonth = zeros();
    for (let i = 0; i <= lastIdx; i++) {
      const end = ymOf(i);
      let s = 0;
      for (const [ym, d] of deltaByYm) if (ym <= end) s += pick(d);
      perMonth[i] = s;
    }
    return perMonth;
  };
  const kasAkhir = cum((d) => d.kas);
  const modalAkhir = cum((d) => d.modal);
  const labaDitahan = cum((d) => d.laba);

  // Kolom bulan yang belum berjalan → null ("—")
  const clip = (v: number[]): (number | null)[] =>
    v.map((x, i) => (i <= lastIdx ? x : null));
  // Nilai snapshot: hanya kolom bulan berjalan
  const snapshotCol = (v: number): (number | null)[] =>
    Array.from({ length: 12 }, (_, i) =>
      ymOf(i) === nowYm ? v : i <= lastIdx ? 0 : null,
    );

  const minus = (a: number[], ...rest: number[][]) =>
    a.map((x, i) => rest.reduce((s, r) => s - r[i], x));
  const plus = (...rows: number[][]) =>
    zeros().map((_, i) => rows.reduce((s, r) => s + r[i], 0));

  // ===== Laba Rugi (Income Statement) =====
  const labaKotor = minus(penjualan, beban.hpp);
  const ebitda = minus(
    labaKotor, beban.iklan, beban.bank, beban.perlengkapan,
    beban.platform, beban.operasional,
  );
  const ebit = minus(ebitda, beban.depresiasi);
  const ebt = minus(ebit, beban.bunga);
  const labaBersih = minus(ebt, beban.pajak);

  const labaRugi: Statement = [
    { label: "Sales", values: clip(penjualan) },
    { label: EXPENSE_LABEL.hpp, values: clip(beban.hpp) },
    { label: "GROSS PROFIT", values: clip(labaKotor), style: "total" },
    { label: EXPENSE_LABEL.iklan, values: clip(beban.iklan) },
    { label: EXPENSE_LABEL.bank, values: clip(beban.bank) },
    { label: EXPENSE_LABEL.perlengkapan, values: clip(beban.perlengkapan) },
    { label: EXPENSE_LABEL.platform, values: clip(beban.platform) },
    { label: EXPENSE_LABEL.operasional, values: clip(beban.operasional) },
    { label: "EBITDA", values: clip(ebitda), style: "total" },
    { label: EXPENSE_LABEL.depresiasi, values: clip(beban.depresiasi) },
    { label: "EBIT", values: clip(ebit), style: "total" },
    { label: EXPENSE_LABEL.bunga, values: clip(beban.bunga) },
    { label: "EBT", values: clip(ebt), style: "total" },
    { label: EXPENSE_LABEL.pajak, values: clip(beban.pajak) },
    { label: "NET INCOME (EAT)", values: clip(labaBersih), style: "total" },
  ];

  // ===== Neraca (Balance Sheet) — posisi akhir bulan =====
  const piutangRow = snapshotCol(piutang);
  const persediaanRow = snapshotCol(persediaan);
  const totalAset = kasAkhir.map((k, i) =>
    i <= lastIdx ? k + (piutangRow[i] ?? 0) + (persediaanRow[i] ?? 0) : 0,
  );
  const totalEkuitas = plus(modalAkhir, labaDitahan);

  const neraca: Statement = [
    { label: "ASSETS", values: null, style: "head" },
    { label: "Cash (saldo buku kas)", values: clip(kasAkhir) },
    { label: "Account Receivable (order belum dibayar)", values: piutangRow },
    { label: "Inventories (nilai stok pusat)", values: persediaanRow },
    { label: "TOTAL ASSETS", values: clip(totalAset), style: "total" },
    { label: "LIABILITIES", values: null, style: "head" },
    { label: "Liabilities (belum dicatat)", values: clip(zeros()) },
    { label: "EQUITY", values: null, style: "head" },
    { label: "Owner's Capital (kumulatif)", values: clip(modalAkhir) },
    { label: "Retained Earnings (kumulatif)", values: clip(labaDitahan) },
    { label: "TOTAL EQUITY", values: clip(totalEkuitas), style: "total" },
    {
      label: "TOTAL LIABILITY AND EQUITY",
      values: clip(totalEkuitas),
      style: "total",
    },
  ];

  // ===== Arus Kas (Cash Flow) — metode langsung dari buku kas =====
  const totalBeban = plus(...Object.values(beban));
  const netOperasi = minus(penjualan, totalBeban);
  const arusBersih = plus(netOperasi, modalMasuk);
  const saldoAkhir = kasAkhir;
  const saldoAwal = zeros().map((_, i) =>
    i <= lastIdx ? saldoAkhir[i] - arusBersih[i] : 0,
  );

  const arusKas: Statement = [
    { label: "OPERATING ACTIVITIES", values: null, style: "head" },
    { label: "Cash Receipts (penjualan & lainnya)", values: clip(penjualan) },
    { label: "Operating Payments", values: clip(totalBeban) },
    {
      label: "Net Cash Flow From Operating Activities",
      values: clip(netOperasi),
      style: "total",
    },
    { label: "FINANCING ACTIVITIES", values: null, style: "head" },
    { label: "Owner's Capital In", values: clip(modalMasuk) },
    { label: "NET CASH FLOW", values: clip(arusBersih), style: "total" },
    { label: "Beginning Cash", values: clip(saldoAwal) },
    { label: "Ending Cash", values: clip(saldoAkhir), style: "total" },
  ];

  return { year, labaRugi, neraca, arusKas };
}
