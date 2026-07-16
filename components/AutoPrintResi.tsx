"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Dipasang di halaman label resi saat datang dari tombol Cetak Resi
// (?auto=1): dialog print/Save-as-PDF langsung terbuka tanpa klik lagi,
// lalu setelah dialog ditutup (tersimpan/batal) balik ke /order — halaman
// label cuma jadi perantara. Delay kecil menunggu logo/font selesai render.
export function AutoPrintResi() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const print = () => {
      timer = setTimeout(() => window.print(), 300);
    };
    if (document.readyState === "complete") print();
    else window.addEventListener("load", print, { once: true });

    const done = () => router.replace("/order");
    window.addEventListener("afterprint", done);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("load", print);
      window.removeEventListener("afterprint", done);
    };
  }, [router]);

  return null;
}
