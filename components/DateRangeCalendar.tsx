"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// Kalender pilih tanggal / blok rentang (dipakai form /keuangan):
// - klik satu tanggal = entri satu hari;
// - klik tanggal lain SETELAHNYA = blok rentang (mis. 1-31) ke-highlight,
//   klik tanggal mulai lagi untuk membatalkan bloknya.
// Nilai dikirim lewat 2 input hidden (name date & dateEnd, format
// YYYY-MM-DD) — server yang menerjemahkan jadi 1 entri per hari.

type Ymd = { y: number; m: number; d: number }; // m = 0-11

const pad = (n: number) => String(n).padStart(2, "0");
const toStr = (x: Ymd) => `${x.y}-${pad(x.m + 1)}-${pad(x.d)}`;
const cmp = (a: Ymd, b: Ymd) => toStr(a).localeCompare(toStr(b));
const dayCount = (a: Ymd, b: Ymd) =>
  Math.round(
    (new Date(b.y, b.m, b.d).getTime() - new Date(a.y, a.m, a.d).getTime()) /
      86_400_000,
  ) + 1;

function todayWib(): Ymd {
  const s = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jakarta",
  }).format(new Date());
  const [y, m, d] = s.split("-").map(Number);
  return { y, m: m - 1, d };
}

function parseYmd(s?: string | null): Ymd | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]) - 1, d: Number(m[3]) };
}

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];

const fmtLabel = (x: Ymd) => `${x.d} ${MONTHS[x.m].slice(0, 3)} ${x.y}`;

export function DateRangeCalendar({
  nameStart = "date",
  nameEnd = "dateEnd",
  range = true,
  initial,
}: {
  nameStart?: string;
  nameEnd?: string;
  // false = hanya satu tanggal (dipakai mode edit)
  range?: boolean;
  // YYYY-MM-DD; kosong = hari ini (WIB)
  initial?: string;
}) {
  const today = todayWib();
  const init = parseYmd(initial) ?? today;
  const [view, setView] = useState({ y: init.y, m: init.m });
  const [start, setStart] = useState<Ymd>(init);
  const [end, setEnd] = useState<Ymd | null>(null);

  function pick(d: Ymd) {
    if (!range) {
      setStart(d);
      return;
    }
    if (cmp(d, start) === 0 && !end) return;
    if (end || cmp(d, start) < 0) {
      // Sudah ada blok / klik sebelum mulai → mulai ulang dari tanggal ini
      setStart(d);
      setEnd(null);
    } else if (cmp(d, start) === 0) {
      setEnd(null); // klik tanggal mulai = batalkan blok
    } else {
      setEnd(d);
    }
  }

  function shiftMonth(delta: number) {
    setView((v) => {
      const m = v.m + delta;
      return { y: v.y + Math.floor(m / 12), m: ((m % 12) + 12) % 12 };
    });
  }

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (Ymd | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => ({
      y: view.y,
      m: view.m,
      d: i + 1,
    })),
  ];

  const inRange = (d: Ymd) =>
    end !== null && cmp(start, d) < 0 && cmp(d, end) < 0;

  return (
    <div className="rounded-lg border border-neutral-300 p-2.5">
      <input type="hidden" name={nameStart} value={toStr(start)} />
      {range && (
        <input type="hidden" name={nameEnd} value={end ? toStr(end) : ""} />
      )}

      {/* Navigasi bulan */}
      <div className="mb-1.5 flex items-center justify-between">
        <button
          type="button"
          onClick={() => shiftMonth(-1)}
          aria-label="Bulan sebelumnya"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-sm font-semibold">
          {MONTHS[view.m]} {view.y}
        </span>
        <button
          type="button"
          onClick={() => shiftMonth(1)}
          aria-label="Bulan berikutnya"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Grid hari — tiap sel (header maupun tanggal) kotak flex identik
          supaya kolomnya lurus persis, tidak bergantung centering teks */}
      <div className="grid grid-cols-7 place-items-center gap-y-0.5">
        {DOW.map((d) => (
          <span
            key={d}
            className="flex h-6 w-8 items-center justify-center text-[10px] font-medium text-neutral-400"
          >
            {d}
          </span>
        ))}
        {cells.map((c, i) => {
          if (!c) return <span key={`x${i}`} className="h-8 w-8" />;
          const isStart = cmp(c, start) === 0;
          const isEnd = end !== null && cmp(c, end) === 0;
          const mid = inRange(c);
          const isToday = cmp(c, today) === 0;
          return (
            <button
              key={toStr(c)}
              type="button"
              onClick={() => pick(c)}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs transition ${
                isStart || isEnd
                  ? "bg-neutral-900 font-semibold text-white"
                  : mid
                    ? "bg-brand/40 font-medium text-neutral-900"
                    : isToday
                      ? "border border-neutral-400 text-neutral-700 hover:bg-neutral-100"
                      : "text-neutral-700 hover:bg-neutral-100"
              }`}
            >
              {c.d}
            </button>
          );
        })}
      </div>

      {/* Ringkasan pilihan */}
      <p className="mt-1.5 border-t border-neutral-100 pt-1.5 text-xs text-neutral-500">
        {end ? (
          <>
            Blok <b>{fmtLabel(start)}</b> – <b>{fmtLabel(end)}</b> ·{" "}
            {dayCount(start, end)} hari (1 catatan/hari)
          </>
        ) : (
          <>
            <b>{fmtLabel(start)}</b>
            {range && " · klik tanggal lain untuk blok rentang"}
          </>
        )}
      </p>
    </div>
  );
}
