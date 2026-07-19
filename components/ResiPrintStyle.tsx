// CSS cetak label resi — dipakai halaman resi satuan & cetak massal.
// Kertas label termal 100×150mm dikunci @page; tiap label (.ug-resi)
// di-skala ResiFitScale lewat CSS var per elemen; break-after:page =
// satu label per lembar saat cetak massal.
export function ResiPrintStyle() {
  return (
    <style>{`
      /* Font label = font sistem (Segoe UI di Windows / Roboto di
         Android — sama seperti WhatsApp): angka 0 Geist ber-garis miring
         (slashed zero) dirasa aneh di label cetak. Berlaku juga untuk
         bagian ber-font-mono (resi, kode barang). */
      #struk-print, #struk-print * {
        font-family: "Segoe UI", Roboto, "Helvetica Neue", Arial,
          sans-serif !important;
      }
      @media print {
        @page { size: 100mm 150mm; margin: 0; }
        /* Override aturan #struk-print milik struk POS di globals.css
           (position absolute + padding) — di sini cuma jadi wadah */
        #struk-print {
          position: static !important;
          width: auto !important;
          max-width: none !important;
          margin: 0 !important;
          padding: 0 !important;
        }
        .ug-resi {
          /* --resi-w/--resi-zoom/--resi-minh di-set ResiFitScale per
             label: isi kepanjangan dikecilkan, isi pendek dibesarkan,
             sisa ruang diskrit diserap min-height (area daftar barang
             print:flex-1 yang melar) — hasilnya pas 1 lembar 100×150 */
          width: var(--resi-w, 94mm) !important;
          max-width: none !important;
          zoom: var(--resi-zoom, 1);
          display: flex;
          flex-direction: column;
          min-height: var(--resi-minh, auto);
          margin: 3mm auto 0 !important;
          break-after: page;
          -webkit-print-color-adjust: exact;
          print-color-adjust: exact;
        }
        .ug-resi:last-child { break-after: auto; }
      }
    `}</style>
  );
}
