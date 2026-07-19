"use client";

import { useLayoutEffect } from "react";

const MM = 96 / 25.4; // px per mm (CSS 96dpi)
const PAPER_W = 94 * MM; // lebar isi label: 100mm - jeda 3mm kiri kanan
const PAPER_H = 144 * MM; // tinggi muat: 150mm - margin atas 3mm - sisa 3mm
// Batas pembesaran label pendek (order 1-2 barang) — tanpa batas, font
// bisa jadi komikal gede di label yang isinya cuma seuprit.
const MAX_ZOOM = 1.6;

// Tiap label resi wajib PAS SATU halaman label 100×150mm (printer termal
// cetak per lembar). Dua arah: isi kepanjangan (item banyak) DIKECILKAN,
// isi pendek DIBESARKAN sampai mengisi tinggi label. Skala lewat `zoom`
// KHUSUS print (CSS var per elemen, dibaca ResiPrintStyle); lebar layout
// di-set 94mm/z supaya lebar TERCETAK selalu tetap 94mm. Men-skala SEMUA
// elemen [data-resi-fit] di halaman — halaman cetak massal berisi banyak
// label, masing-masing dapat skala sendiri.
export function ResiFitScale() {
  useLayoutEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>("[data-resi-fit]"),
    );
    if (els.length === 0) return;

    const fitOne = (el: HTMLElement) => {
      const prevWidth = el.style.width;
      const prevMaxWidth = el.style.maxWidth;
      // PENTING (1): lepas max-width (class max-w-md) selama pengukuran —
      // lebar ukur bisa melebihi 448px; kalau ke-clamp, tinggi ketaksir
      // lebih besar dari kondisi cetak → zoom kekecilan → sisa ruang kosong.
      el.style.maxWidth = "none";
      // PENTING (2): fit juga jalan saat beforeprint, saat CSS print
      // SUDAH aktif. Di situ `width: var(--resi-w) !important` mengalahkan
      // inline width, dan zoom yang sedang terpasang ikut men-skala hasil
      // getBoundingClientRect → pengukuran makan hasil skalanya sendiri
      // (zoom bisa meledak/menyusut liar). Netralkan: zoom 1 dan lebar
      // di-set lewat CSS var yang sama — menang di kedua media.
      el.style.setProperty("--resi-zoom", "1");
      // min-height juga dinetralkan — kalau ikut kepasang saat mengukur,
      // tinggi hasil ukur ketarik ke nilai lama (feedback).
      el.style.setProperty("--resi-minh", "0px");
      const setW = (px: number) => {
        el.style.width = `${px}px`;
        el.style.setProperty("--resi-w", `${px}px`);
      };
      // Cari zoom TERBESAR yang masih muat via binary search. Iterasi
      // titik-tetap (z = tinggi/kertas berulang) tidak dipakai: tinggi
      // label melompat-lompat saat lebar berubah (nama produk pindah 1↔2
      // baris) sehingga iterasinya berosilasi dan bisa berhenti di zoom
      // kekecilan → label tercetak pendek menyisakan ruang kosong.
      const fits = (zz: number) => {
        setW(PAPER_W / zz);
        return zz * el.getBoundingClientRect().height <= PAPER_H + 0.5;
      };
      let z: number;
      if (fits(MAX_ZOOM)) {
        z = MAX_ZOOM;
      } else {
        let lo = 0.2; // batas bawah aman — label 5x kertas pun masih ketemu
        let hi = MAX_ZOOM;
        for (let i = 0; i < 14; i++) {
          const mid = (lo + hi) / 2;
          if (fits(mid)) lo = mid;
          else hi = mid;
        }
        z = lo;
      }

      el.style.width = prevWidth;
      el.style.maxWidth = prevMaxWidth;
      el.style.setProperty("--resi-zoom", z.toFixed(4));
      el.style.setProperty("--resi-w", `${Math.round(PAPER_W / z)}px`);
      // Sisa ruang diskrit (zoom naik dikit = ada teks turun baris =
      // kelebihan) diserap min-height: label dipaksa setinggi kertas,
      // area daftar barang (print:flex-1) yang melar mengisi sisanya.
      el.style.setProperty("--resi-minh", `${Math.floor(PAPER_H / z)}px`);
    };

    const fit = () => els.forEach(fitOne);
    fit();
    // Ukur ulang setelah font web selesai dimuat (tinggi bisa bergeser)
    document.fonts?.ready.then(fit);
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, []);

  return null;
}
