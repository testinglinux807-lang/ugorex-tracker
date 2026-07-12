// Perhitungan laporan keuangan (halaman /keuangan) dari buku kas
// FinanceEntry. Semua bucketing bulan memakai zona WIB, konsisten dengan
// lib/date.ts (server bisa jalan di UTC).

export type EntryLite = {
  type: string; // INCOME | EXPENSE
  amount: number;
  date: Date;
  category: string | null;
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
  "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
];

// Kunci bulan WIB "2026-07" untuk sebuah instant.
export function wibYm(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
  }).format(d);
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  return `${MONTH_NAMES[Number(m) - 1]} ${y}`;
}

// ===== Arus kas bulanan =====

export type CashflowRow = {
  label: string; // "Jul 2026"
  masuk: number;
  keluar: number;
  net: number; // masuk - keluar
  saldo: number; // saldo kas akhir bulan (kumulatif sejak awal pencatatan)
};

export function monthlyCashflow(
  entries: EntryLite[],
  months = 6,
  now: Date = new Date(),
): CashflowRow[] {
  // Deret kunci bulan, tertua duluan
  const [y0, m0] = wibYm(now).split("-").map(Number);
  const keys: string[] = [];
  for (let i = 0, y = y0, m = m0; i < months; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }

  const buckets = new Map(keys.map((k) => [k, { masuk: 0, keluar: 0 }]));
  let saldoAwal = 0; // saldo sebelum bulan pertama yang ditampilkan
  for (const e of entries) {
    const k = wibYm(e.date);
    const b = buckets.get(k);
    if (b) {
      if (e.type === "INCOME") b.masuk += e.amount;
      else b.keluar += e.amount;
    } else if (k < keys[0]) {
      saldoAwal += e.type === "INCOME" ? e.amount : -e.amount;
    }
  }

  let saldo = saldoAwal;
  return keys.map((k) => {
    const b = buckets.get(k)!;
    const net = b.masuk - b.keluar;
    saldo += net;
    return { label: monthLabel(k), masuk: b.masuk, keluar: b.keluar, net, saldo };
  });
}

// ===== Laba rugi per periode =====

export type CategoryRow = { category: string; amount: number };

export type PnlReport = {
  label: string; // "Jul 2026"
  income: CategoryRow[]; // pendapatan per kategori, terbesar duluan
  expense: CategoryRow[]; // beban per kategori, terbesar duluan
  totalIncome: number;
  totalExpense: number;
  net: number; // laba (rugi) bersih
};

export function periodPnl(
  entries: EntryLite[],
  from: Date,
  to: Date | null, // null = sampai sekarang
  label: string,
): PnlReport {
  const inc = new Map<string, number>();
  const exp = new Map<string, number>();
  for (const e of entries) {
    if (e.date < from || (to !== null && e.date >= to)) continue;
    const cat = e.category?.trim() || "Lainnya";
    const m = e.type === "INCOME" ? inc : exp;
    m.set(cat, (m.get(cat) ?? 0) + e.amount);
  }
  const toRows = (m: Map<string, number>): CategoryRow[] =>
    [...m.entries()]
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  const income = toRows(inc);
  const expense = toRows(exp);
  const totalIncome = income.reduce((a, r) => a + r.amount, 0);
  const totalExpense = expense.reduce((a, r) => a + r.amount, 0);
  return {
    label,
    income,
    expense,
    totalIncome,
    totalExpense,
    net: totalIncome - totalExpense,
  };
}

export function wibMonthLabel(d: Date): string {
  return monthLabel(wibYm(d));
}
