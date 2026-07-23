import { redirect } from "next/navigation";

// Halaman "Tambah Konter" sudah dilebur jadi panel di /konter. Route lama
// dipertahankan biar link/bookmark lama tetap jalan.
export default function TambahKonterPage() {
  redirect("/konter?tambah=1#tambah");
}
