import Image from "next/image";

// Loading UI full-screen untuk halaman di luar layout aplikasi
// (halaman landing "/" dan login) saat pertama kali dimuat.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-16 w-16">
          <div className="absolute inset-0 animate-spin rounded-full border-[3px] border-neutral-200 border-t-brand" />
          <div className="absolute inset-[10px] overflow-hidden rounded-full">
            <Image
              src="/logo.webp"
              alt="Ugorex"
              fill
              sizes="44px"
              className="object-cover object-top"
              priority
            />
          </div>
        </div>
        <p className="text-sm text-neutral-400">Memuat…</p>
      </div>
    </div>
  );
}
