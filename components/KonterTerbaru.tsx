"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export type KonterTerbaruItem = {
  id: string;
  name: string;
  area: string | null;
  isNew: boolean;
  isActive: boolean;
};

const PER_SLIDE = 2;

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export function KonterTerbaru({ stores }: { stores: KonterTerbaruItem[] }) {
  const [slide, setSlide] = useState(0);

  const slides: KonterTerbaruItem[][] = [];
  for (let i = 0; i < stores.length; i += PER_SLIDE)
    slides.push(stores.slice(i, i + PER_SLIDE));

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = setInterval(
      () => setSlide((s) => (s + 1) % slides.length),
      3500,
    );
    return () => clearInterval(t);
  }, [slides.length]);

  if (stores.length === 0) {
    return <p className="text-sm text-neutral-400">Belum ada konter.</p>;
  }

  const cur = Math.min(slide, slides.length - 1);

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col justify-center">
        <ul key={cur} className="animate-ugfade space-y-2">
          {slides[cur].map((s) => (
            <li key={s.id}>
              <Link
                href={`/konter/${s.id}`}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 p-3 hover:border-neutral-400"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-900 text-xs font-bold text-white">
                  {initials(s.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="truncate text-xs text-neutral-400">
                    {s.area ?? "—"}
                  </p>
                </div>
                {s.isNew ? (
                  <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-neutral-900">
                    Baru
                  </span>
                ) : s.isActive ? (
                  <span className="shrink-0 rounded-full border border-neutral-300 px-2 py-0.5 text-[10px] font-medium text-neutral-600">
                    Aktif
                  </span>
                ) : (
                  <span className="shrink-0 rounded-full border border-neutral-200 px-2 py-0.5 text-[10px] text-neutral-400">
                    Pasif
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </div>

      {slides.length > 1 && (
        <div className="mt-3 flex items-center justify-center gap-1.5">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setSlide(i)}
              aria-label={`Slide ${i + 1}`}
              className={`h-1.5 rounded-full transition-all ${
                i === cur ? "w-4 bg-neutral-900" : "w-1.5 bg-neutral-300"
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
