"use client";

import { Printer } from "lucide-react";

// Tombol cetak di halaman label resi — memanggil dialog print browser.
// Elemen toolbar-nya sendiri disembunyikan saat print (print:hidden di page).
export function PrintResiButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800"
    >
      <Printer className="h-4 w-4" />
      Cetak
    </button>
  );
}
