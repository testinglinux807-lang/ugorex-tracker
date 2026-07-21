import Image from "next/image";
import { prisma } from "@/lib/prisma";
import { GudangRegisterForm } from "@/components/GudangRegisterForm";

// Halaman PUBLIK (dikecualikan di middleware): registrasi gudang via link
// undangan sekali-pakai yang dibuat admin di Data → Akun Gudang. Token tidak
// valid / kedaluwarsa / sudah terpakai → tampil pesan, bukan form.
export default async function DaftarGudangPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await prisma.gudangInvite.findUnique({ where: { token } });

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

  return <GudangRegisterForm token={token} />;
}
