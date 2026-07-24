"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";

const rupiah = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(n);

// Lama animasi buka/tutup. Dipakai CSS (duration-200) DAN timer unmount —
// harus sama, kalau timer lebih pendek panelnya hilang sebelum animasi
// selesai (kedip), kalau kepanjangan ada jeda mati setelah animasi.
const ANIM_MS = 200;

// Satu baris = satu KODE mold (barang fisik). Owner belanja per kode; tiap
// kode punya daftar tipe HP yang kompatibel (models) sebagai penjelasan.
export type RestockCode = {
  code: string; // "AA10" — key & yang ditampilkan
  repId: string; // productId perwakilan yang dikirim ke server
  type: string; // "Antigores Spy" / "Antigores Clear"
  models: string[]; // tipe HP yang cocok, mis. ["iPhone 17", "iPhone 16 Pro"]
  price: number;
  central: number; // stok pusat yang bisa di-order (dibagi sekode)
};

// Dropdown pilih KODE mold (bukan per model HP) — dipakai di checkout restok
// owner. Cari pakai kode, jenis, atau tipe HP mana pun yang kompatibel.
//
// Bentuknya beda per layar:
// - HP    : bottom sheet (fixed, naik dari bawah). Panel absolut biasa
//           kepotong tepi layar karena pickernya ada di tengah form yang
//           panjang — daftar panjang jadi mentok dan susah discroll.
// - Desktop: dropdown menempel di bawah tombol seperti biasa.
export function CodePicker({
  codes,
  onPick,
}: {
  codes: RestockCode[];
  onPick: (code: string) => void; // kode yang dipilih (key)
}) {
  // Dua state, bukan satu — ini kunci animasi buka DAN tutup:
  //   mounted = elemennya ada di DOM
  //   shown   = kelas posisi "terbuka" menyala (yang ditransisikan)
  // Buka : mount dulu (posisi tertutup) → frame berikutnya nyalakan shown,
  //        browser lihat nilainya berubah → jalan transisinya.
  // Tutup: matikan shown (animasi mundur) → baru unmount setelah selesai.
  // Kalau cuma pakai satu state, elemen langsung hilang dari DOM dan tidak
  // ada yang bisa dianimasikan waktu menutup.
  const [mounted, setMounted] = useState(false);
  const [shown, setShown] = useState(false);
  const [q, setQ] = useState("");
  // Penempatan dropdown DESKTOP. Picker ini ada di tengah form checkout yang
  // panjang, jadi kalau tombolnya lagi di bawah layar, dropdown yang selalu
  // membuka ke bawah bakal kepotong tepi viewport. `up` = buka ke atas,
  // `max` = tinggi maksimal daftar sesuai ruang yang benar-benar ada.
  // (Di HP tidak dipakai — bentuknya bottom sheet.)
  const [place, setPlace] = useState({ up: false, max: 288 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ukur ruang di atas & bawah tombol, lalu putuskan arah bukanya.
  // Dipanggil dari event handler / effect — bukan saat render.
  function measure() {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const GAP = 16; // sisa napas ke tepi layar
    const below = window.innerHeight - r.bottom - GAP;
    const above = r.top - GAP;
    // Buka ke atas hanya kalau bawah sempit DAN atas lebih lega
    const up = below < 240 && above > below;
    // Tinggi daftar dibatasi ruang nyata, tapi jangan lebih dari 288px
    // (max-h-72 seperti semula) biar tidak jadi panel raksasa di layar tinggi
    const room = (up ? above : below) - 96; // 96 = kolom cari + padding
    setPlace({ up, max: Math.max(120, Math.min(288, room)) });
  }

  function openPanel() {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    measure();
    setMounted(true);
    // requestAnimationFrame: kasih browser satu frame buat "melihat" keadaan
    // tertutup dulu. Tanpa ini React bisa menggabung mount + kelas terbuka
    // dalam satu paint, browser tidak punya nilai awal buat ditransisikan,
    // dan panelnya muncul jeblak tanpa animasi.
    requestAnimationFrame(() => setShown(true));
  }

  function closePanel() {
    setShown(false);
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => {
      setMounted(false);
      setQ(""); // dibersihkan setelah hilang, biar daftar tak berkedip
    }, ANIM_MS);
  }

  useEffect(() => {
    if (!mounted) return;
    function onDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) closePanel();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closePanel();
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    // Halaman digeser / jendela diubah ukurannya saat dropdown terbuka →
    // ruang di atas & bawah berubah, arah bukanya ikut dihitung ulang.
    window.addEventListener("scroll", measure, true);
    window.addEventListener("resize", measure);

    const isMobile = window.matchMedia("(max-width: 639px)").matches;
    // Sheet HP menutupi layar — kunci scroll body biar yang kegeser isi
    // daftarnya, bukan halaman di belakangnya.
    const prevOverflow = document.body.style.overflow;
    if (isMobile) document.body.style.overflow = "hidden";
    // Fokus kolom cari cuma di desktop. Di HP, keyboard yang naik barengan
    // sheet yang lagi meluncur bikin gerakannya patah-patah.
    else searchRef.current?.focus();

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", measure, true);
      window.removeEventListener("resize", measure);
      if (isMobile) document.body.style.overflow = prevOverflow;
    };
  }, [mounted]);

  // Bersihkan timer kalau komponen dilepas saat animasi tutup berjalan
  useEffect(() => {
    return () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    };
  }, []);

  const term = q.trim().toLowerCase();
  const shownCodes = useMemo(() => {
    if (!term) return codes;
    return codes.filter((c) =>
      `${c.code} ${c.type} ${c.models.join(" ")}`.toLowerCase().includes(term),
    );
  }, [codes, term]);

  function pick(code: string) {
    onPick(code);
    closePanel();
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => (mounted ? closePanel() : openPanel())}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-neutral-300 px-3 py-2 text-left text-sm text-neutral-400"
      >
        <span>- Pilih kode barang -</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-200 ${
            shown ? "rotate-180" : ""
          }`}
        />
      </button>

      {mounted && (
        <>
          {/* Latar gelap khusus HP — cuma opacity yang dianimasikan */}
          <div
            onClick={closePanel}
            className={`fixed inset-0 z-30 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none sm:hidden ${
              shown ? "opacity-100" : "opacity-0"
            }`}
          />

          <div
            style={{ "--dd-max": `${place.max}px` } as React.CSSProperties}
            className={
              // HP: sheet nempel di bawah layar, tinggi dibatasi dvh (bukan
              // tinggi tetap) supaya ikut menyusut saat keyboard muncul.
              "fixed inset-x-0 bottom-0 z-40 flex max-h-[80dvh] flex-col overflow-hidden rounded-t-2xl border border-neutral-200 bg-white shadow-2xl " +
              // Desktop: kembali jadi dropdown yang menempel di tombol.
              "sm:absolute sm:inset-x-0 sm:z-20 sm:max-h-none sm:rounded-xl sm:shadow-lg " +
              // Arah buka desktop mengikuti ruang yang tersedia. origin-*
              // disamakan dengan arahnya supaya efek "mengembang" keluar dari
              // tombol, bukan dari sisi yang berlawanan.
              (place.up
                ? "sm:bottom-full sm:top-auto sm:mb-1 sm:origin-bottom "
                : "sm:top-full sm:bottom-auto sm:mt-1 sm:origin-top ") +
              // Yang dianimasikan HANYA transform + opacity: dua properti ini
              // dikerjakan compositor GPU, tidak memicu layout/repaint, jadi
              // mulus 60fps. Menganimasikan height/top/margin bikin browser
              // menghitung ulang layout tiap frame → patah-patah di HP.
              // ease-out: cepat di awal lalu melambat — terasa responsif.
              "transition-[transform,opacity] duration-200 ease-out will-change-transform motion-reduce:transition-none " +
              (shown
                ? "translate-y-0 opacity-100 sm:scale-100"
                : // HP: mulai dari bawah layar. Desktop: mengecil sedikit +
                  // bergeser 4px dari arah tombol — dropdown terasa "keluar"
                  // dari tombolnya, bukan sekadar muncul.
                  "translate-y-full opacity-0 sm:scale-95 " +
                    (place.up ? "sm:translate-y-1" : "sm:-translate-y-1"))
            }
          >
            {/* Kepala sheet (HP saja): pegangan geser + tombol tutup */}
            <div className="shrink-0 sm:hidden">
              <div className="flex justify-center pt-2">
                <span className="h-1 w-9 rounded-full bg-neutral-300" />
              </div>
              <div className="flex items-center justify-between px-4 pb-1 pt-2">
                <p className="text-sm font-semibold">Pilih kode barang</p>
                <button
                  type="button"
                  onClick={closePanel}
                  aria-label="Tutup"
                  className="-mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100"
                >
                  <X className="h-4.5 w-4.5" />
                </button>
              </div>
            </div>

            <div className="relative shrink-0 border-b border-neutral-100 p-2">
              <Search className="pointer-events-none absolute left-4.5 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
              <input
                ref={searchRef}
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Cari kode / tipe HP (mis. iPhone 17, AA10)…"
                className="w-full rounded-lg border border-neutral-200 py-1.5 pl-8 pr-8 text-sm transition-colors focus:border-neutral-400 focus:outline-none"
              />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  aria-label="Hapus pencarian"
                  className="absolute right-4 top-1/2 -translate-y-1/2 rounded p-0.5 text-neutral-400 transition-colors hover:text-neutral-900"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Tinggi daftar desktop dari hasil ukur (--dd-max), bukan angka
                mati — jadi tidak pernah lewat tepi layar. */}
            <ul className="flex-1 overflow-y-auto overscroll-contain py-1 sm:max-h-[var(--dd-max)]">
              {shownCodes.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-neutral-400">
                  Kode tidak ditemukan.
                </li>
              ) : (
                shownCodes.map((c) => {
                  const habis = c.central <= 0;
                  return (
                    <li key={c.code}>
                      <button
                        type="button"
                        onClick={() => pick(c.code)}
                        disabled={habis}
                        // active:scale — umpan balik sentuh, biar kerasa
                        // "ketekan" di HP yang tidak punya hover.
                        className="flex w-full flex-col gap-0.5 px-3 py-2.5 text-left transition-colors duration-100 hover:bg-neutral-100 active:bg-neutral-100 disabled:opacity-50 sm:py-2"
                      >
                        {/* min-w-0 + truncate: nama jenis panjang tidak
                            mendorong harga keluar kartu di layar sempit */}
                        <span className="flex w-full items-center gap-1.5">
                          <span className="shrink-0 rounded bg-neutral-900 px-1 py-0.5 text-[10px] font-bold text-white">
                            {c.code}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-sm font-medium">
                            {c.type}
                          </span>
                          <span className="shrink-0 text-xs text-neutral-500">
                            {rupiah(c.price)}
                          </span>
                        </span>
                        <span className="break-words text-[11px] leading-snug text-neutral-500">
                          Cocok {c.models.length} tipe HP:{" "}
                          {c.models.map((m, i) => (
                            <span key={i}>
                              {i > 0 && ", "}
                              {/* tipe HP yang cocok dgn pencarian di-mark lime */}
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
                        <span
                          className={`text-[10px] ${
                            habis
                              ? "text-red-500"
                              : c.central <= 10
                                ? "font-semibold text-amber-600"
                                : "text-neutral-400"
                          }`}
                        >
                          {habis ? "Stok pusat habis" : `Stok pusat ${c.central}`}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {/* Kaki sheet (HP): jumlah hasil + aman dari gesture bar iOS */}
            <div className="shrink-0 border-t border-neutral-100 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] text-center text-xs text-neutral-400 sm:hidden">
              {shownCodes.length} kode
              {term ? " cocok" : " tersedia"} · ketuk buat masukin keranjang
            </div>
          </div>
        </>
      )}
    </div>
  );
}
