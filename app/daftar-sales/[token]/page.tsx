import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { SalesRegisterForm } from "@/components/SalesRegisterForm";

// Halaman PUBLIK (dikecualikan di middleware): registrasi sales via link
// undangan sekali-pakai yang dibuat admin di /sales. Token tidak valid /
// kedaluwarsa / sudah terpakai → tampil pesan, bukan form.
export default async function DaftarSalesPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.salesInvite.findUnique({ where: { token } });

  const invalid = !invite
    ? "Link registrasi tidak ditemukan."
    : invite.usedAt
      ? "Link registrasi ini sudah terpakai."
      : invite.expiresAt < new Date()
        ? "Link registrasi sudah kedaluwarsa."
        : null;

  if (invalid) {
    return (
      <div className="flex min-h-screen flex-1 items-center justify-center bg-white p-4">
        <div className="w-full max-w-sm text-center">
          <Image
            src="/logo.webp"
            alt="Ugorex"
            width={342}
            height={360}
            className="mx-auto mb-4 h-20 w-auto"
          />
          <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="font-semibold">{invalid}</p>
            <p className="mt-1 text-sm text-neutral-500">
              Minta link registrasi baru ke admin Ugorex.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <SalesRegisterForm token={token} />;
}
