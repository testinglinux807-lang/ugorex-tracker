"use client";

import { useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { Spinner } from "@/components/SubmitButton";

// Link yang nampilin overlay loading Ugorex begitu diklik. Next.js TIDAK
// menampilkan loading.tsx pas transisi Link antar-halaman kalau halaman
// lamanya masih ada isinya (React startTransition menahan UI lama sampai
// halaman baru siap) - jadi kelihatan diam/ngestuck kalau tujuannya butuh
// waktu nge-query. Pakai useTransition sendiri biar overlay-nya muncul.
export function LoadingLink({
  href,
  className,
  loadingText = "Memuat…",
  icon,
  children,
}: {
  href: string;
  className?: string;
  loadingText?: string;
  icon?: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <>
      {pending && <LoadingOverlay text={loadingText} />}
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(() => router.push(href))}
        className={className}
      >
        {pending ? <Spinner className="h-3.5 w-3.5" /> : icon}
        {children}
      </button>
    </>
  );
}
