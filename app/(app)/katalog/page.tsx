import { redirect } from "next/navigation";

// Halaman Katalog sudah dihapus — diganti to-do list Tugas.
// (Katalog barang tetap ada di menu Data; penawaran ke konter lewat
// Catat Kunjungan di halaman Konter.)
export default function KatalogPage() {
  redirect("/tugas");
}
