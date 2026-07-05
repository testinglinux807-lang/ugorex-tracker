"use client";

import Image from "next/image";

// Overlay loading full-screen — efek yang sama dengan loading.tsx utama
// (logo dalam cincin lime berputar). Dipakai saat aksi penting sedang
// diproses supaya jelas ada yang jalan; latensi ke DB bisa beberapa detik
// dan spinner kecil di tombol gampang kelewat.
export function LoadingOverlay({ text = "Memproses…" }: { text?: string }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm">
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
            />
          </div>
        </div>
        <p className="text-sm font-medium text-neutral-500">{text}</p>
      </div>
    </div>
  );
}
