"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { rupiah, rupiahShort } from "@/lib/format";
import {
  STATEMENT_MONTHS,
  type FinanceStatements as Statements,
  type Statement,
} from "@/lib/finance-statements";

// Tab laporan keuangan tahunan (admin, /keuangan): Laba Rugi, Neraca,
// Arus Kas — matriks 12 bulan, scroll horizontal di layar sempit.

const TABS = [
  { key: "labaRugi", label: "Income Statement" },
  { key: "neraca", label: "Balance Sheet" },
  { key: "arusKas", label: "Cash Flow" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const NOTES: Record<TabKey, string> = {
  labaRugi:
    "Dihitung dari buku kas per kategori — catat beban dengan kategori baku " +
    "(Beli barang, Iklan, Pajak, dll.) supaya masuk baris yang tepat. " +
    "Modal masuk tidak dihitung pendapatan.",
  neraca:
    "Kas, Modal, dan Laba Ditahan kumulatif akurat per akhir bulan. Piutang " +
    "& Persediaan hanya snapshot hari ini (kolom bulan berjalan) — karena " +
    "itu Total Aset bulan ini bisa lebih besar dari Ekuitas.",
  arusKas:
    "Metode langsung dari buku kas: penerimaan & pengeluaran nyata per " +
    "bulan, modal masuk dipisah sebagai aktivitas pendanaan.",
};

// Sel angka: singkat di layar, lengkap saat hover; negatif merah.
function Cell({ v }: { v: number | null }) {
  if (v === null) return <span className="text-neutral-300">—</span>;
  const neg = v < 0;
  return (
    <span title={rupiah(v)} className={neg ? "text-red-600" : undefined}>
      {neg ? `−${rupiahShort(-v)}` : rupiahShort(v)}
    </span>
  );
}

function StatementTable({ rows, year }: { rows: Statement; year: number }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[56rem] border-collapse text-xs">
        <thead>
          <tr className="border-b border-neutral-200 text-neutral-400">
            <th className="sticky left-0 bg-white py-2 pr-3 text-left font-medium">
              {year}
            </th>
            {STATEMENT_MONTHS.map((m) => (
              <th key={m} className="px-2 py-2 text-right font-medium">
                {m}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) =>
            r.values === null ? (
              // Judul seksi (ASET / KEWAJIBAN / …)
              <tr key={r.label} className="border-b border-neutral-100">
                <td
                  colSpan={13}
                  className="sticky left-0 bg-white pb-1 pt-3 text-[10px] font-bold uppercase tracking-wide text-neutral-400"
                >
                  {r.label}
                </td>
              </tr>
            ) : (
              <tr
                key={r.label}
                className={`border-b border-neutral-100 ${
                  r.style === "total" ? "bg-neutral-50 font-bold" : ""
                }`}
              >
                <td
                  className={`sticky left-0 max-w-32 truncate py-1.5 pr-3 sm:max-w-52 ${
                    r.style === "total"
                      ? "bg-neutral-50 text-neutral-900"
                      : "bg-white text-neutral-600"
                  }`}
                  title={r.label}
                >
                  {r.label}
                </td>
                {r.values.map((v, i) => (
                  <td key={i} className="whitespace-nowrap px-2 py-1.5 text-right">
                    <Cell v={v} />
                  </td>
                ))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

export function FinanceStatements({
  data,
  minYear,
  maxYear,
}: {
  data: Statements;
  minYear: number; // tahun entri pertama buku kas
  maxYear: number; // tahun berjalan
}) {
  const [tab, setTab] = useState<TabKey>("labaRugi");

  return (
    <section className="rounded-2xl border border-neutral-200 bg-white p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm ${
                tab === t.key
                  ? "bg-neutral-900 text-white"
                  : "border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Navigasi tahun — link server, laporan dihitung ulang */}
        <div className="flex items-center gap-1 text-sm font-semibold">
          {data.year > minYear ? (
            <Link
              href={`/keuangan?tahun=${data.year - 1}`}
              scroll={false}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
            >
              <ChevronLeft className="h-4 w-4" />
            </Link>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-300">
              <ChevronLeft className="h-4 w-4" />
            </span>
          )}
          <span className="px-1">{data.year}</span>
          {data.year < maxYear ? (
            <Link
              href={`/keuangan?tahun=${data.year + 1}`}
              scroll={false}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-300 text-neutral-500 hover:bg-neutral-100"
            >
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-neutral-200 text-neutral-300">
              <ChevronRight className="h-4 w-4" />
            </span>
          )}
        </div>
      </div>

      {/* Hint mobile: tabel 12 bulan digeser ke samping */}
      <p className="mb-1 text-[10px] text-neutral-400 sm:hidden">
        Geser tabel ke samping untuk bulan lainnya →
      </p>

      <StatementTable rows={data[tab]} year={data.year} />

      <p className="mt-3 text-xs text-neutral-400">{NOTES[tab]}</p>
    </section>
  );
}
