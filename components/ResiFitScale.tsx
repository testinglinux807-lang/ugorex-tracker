"use client";

import { useLayoutEffect } from "react";

const MM = 96 / 25.4; // px per mm (CSS 96dpi)
const PAPER_W = 90 * MM; // lebar isi label: 100mm - jeda 5mm kiri kanan
const PAPER_H = 141 * MM; // tinggi muat: 150mm - margin atas 4mm - sisa bawah

// Label resi wajib muat SATU halaman label 100×150mm (printer termal cetak
// per lembar — kelebihan = kepotong). Kalau isi label (item banyak) lebih
// tinggi dari kertas, seluruh label dikecilkan lewat `zoom` KHUSUS print
// (CSS var dibaca blok @media print di halaman resi); lebar layout ikut
// dilebarkan 90mm/z supaya lebar TERCETAK tetap 90mm, tidak ikut menciut.
export function ResiFitScale() {
  useLayoutEffect(() => {
    const el = document.getElementById("struk-print");
    if (!el) return;

    const fit = () => {
      const prevWidth = el.style.width;
      // Titik-tetap: tinggi label berubah saat lebar layout berubah, jadi
      // ukur-hitung beberapa putaran sampai z stabil.
      let z = 1;
      for (let i = 0; i < 4; i++) {
        el.style.width = `${PAPER_W / z}px`;
        const h = el.getBoundingClientRect().height;
        const zNext = Math.min(1, PAPER_H / h);
        if (Math.abs(zNext - z) < 0.01) {
          z = zNext;
          break;
        }
        z = zNext;
      }
      // Cek akhir pada lebar final — kalau masih lebih, rapatkan sekali lagi
      el.style.width = `${PAPER_W / z}px`;
      const h = el.getBoundingClientRect().height;
      if (z * h > PAPER_H) z = PAPER_H / h;

      el.style.width = prevWidth;
      el.style.setProperty("--resi-zoom", z.toFixed(4));
      el.style.setProperty("--resi-w", `${Math.round(PAPER_W / z)}px`);
    };

    fit();
    // Ukur ulang setelah font web selesai dimuat (tinggi bisa bergeser)
    document.fonts?.ready.then(fit);
    window.addEventListener("beforeprint", fit);
    return () => window.removeEventListener("beforeprint", fit);
  }, []);

  return null;
}
