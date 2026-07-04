import Image from "next/image";

// Loading UI untuk semua halaman ber-layout (semua role):
// logo Ugorex di dalam cincin berputar beraksen lime — sama dengan
// loader full-screen saat login/pemuatan awal.
export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
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
