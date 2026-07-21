"use client";

import { useActionState, useState } from "react";
import { Star } from "lucide-react";
import { rateSales } from "@/app/actions/rating";
import { PendingLabel } from "@/components/SubmitButton";

// Form owner di halaman POS: nilai sales pemegang konter dengan bintang
// 1-5 + keterangan. Satu konter satu rating — simpan ulang = mengubah.
export function RateSalesForm({
  salesName,
  currentStars,
  currentNote,
}: {
  salesName: string;
  currentStars: number | null;
  currentNote: string | null;
}) {
  const [stars, setStars] = useState(currentStars ?? 0);
  const [hover, setHover] = useState(0);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await rateSales(fd)) ?? null,
    null,
  );

  const shown = hover || stars;

  return (
    <form action={formAction} className="space-y-2.5">
      <input type="hidden" name="stars" value={stars} />

      <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setStars(n)}
            onMouseEnter={() => setHover(n)}
            title={`${n} bintang`}
            className="p-0.5"
          >
            <Star
              className={`h-7 w-7 transition ${
                n <= shown
                  ? "fill-brand text-brand-dark"
                  : "text-neutral-300"
              }`}
            />
          </button>
        ))}
        {stars > 0 && (
          <span className="ml-1.5 text-sm font-bold">{stars}/5</span>
        )}
      </div>

      <textarea
        name="note"
        rows={2}
        defaultValue={currentNote ?? ""}
        placeholder={`Keterangan (opsional), mis. ${salesName} rajin mampir & stok selalu aman`}
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />

      {state?.error && (
        <p className="text-xs font-medium text-red-600">{state.error}</p>
      )}
      {state?.ok && (
        <p className="text-xs font-medium text-neutral-600">
          Rating tersimpan - makasih!
        </p>
      )}

      <button
        type="submit"
        disabled={pending || stars === 0}
        className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? (
          <PendingLabel text="Menyimpan…" />
        ) : currentStars !== null ? (
          "Ubah Rating"
        ) : (
          "Kirim Rating"
        )}
      </button>
    </form>
  );
}
