import { redirect } from "next/navigation";

// Halaman stok berdiri sendiri sudah digabung ke tab "Stok" di /order —
// redirect biar bookmark/link lama tidak 404.
export default function StokPage() {
  redirect("/order");
}
