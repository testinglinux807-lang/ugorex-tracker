import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/components/LoginForm";

export default async function LoginPage() {
  // Cek DB, bukan cuma JWT: cookie basi (user sudah tidak ada di DB)
  // akan tetap menampilkan form login, bukan loop redirect.
  const user = await getCurrentUser();
  if (user) {
    if (user.role === "OWNER") redirect("/pos");
    if (user.role === "SALES") redirect("/beranda");
    redirect("/dashboard");
  }

  return <LoginForm />;
}
