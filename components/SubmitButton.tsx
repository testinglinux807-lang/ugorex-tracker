"use client";

import { useFormStatus } from "react-dom";
import { LoadingOverlay } from "@/components/LoadingOverlay";

// Spinner kecil yang mengikuti warna teks tombol/konteksnya
export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
    />
  );
}

// Label "sedang diproses" dengan spinner — untuk tombol yang sudah punya
// state pending sendiri dari useActionState.
export function PendingLabel({ text }: { text: string }) {
  return (
    <span className="inline-flex items-center justify-center gap-2">
      <Spinner className="h-3.5 w-3.5" />
      {text}
    </span>
  );
}

// Tombol submit dengan animasi loading otomatis saat form-nya sedang dikirim.
// Dipakai di form yang memanggil server action langsung (tanpa useActionState).
// overlayText: tampilkan juga overlay loading full-screen (efek Ugorex utama)
// selama diproses — untuk aksi penting yang latensinya terasa.
export function SubmitButton({
  children,
  pendingText,
  className,
  title,
  overlayText,
}: {
  children: React.ReactNode;
  pendingText?: string;
  className?: string;
  title?: string;
  overlayText?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <>
      {pending && overlayText && <LoadingOverlay text={overlayText} />}
      <button type="submit" disabled={pending} className={className} title={title}>
        {pending ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Spinner className="h-3.5 w-3.5" />
            {pendingText ?? children}
          </span>
        ) : (
          children
        )}
      </button>
    </>
  );
}
