import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { AddKonterForm } from "@/components/AddKonterForm";

export default async function TambahKonterPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role === "OWNER") redirect("/pos");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Tambah Konter</h1>
        <p className="text-sm text-neutral-500">
          Daftarkan konter baru yang kamu kunjungi
        </p>
      </div>
      <AddKonterForm />
    </div>
  );
}
