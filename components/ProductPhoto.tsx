"use client";

import { useActionState, useRef, useState } from "react";
import { updateProductImage } from "@/app/actions/tracker";
import { ImagePlus, X } from "lucide-react";
import { Spinner } from "@/components/SubmitButton";

// Kompres foto di browser (maks 512px, WebP) supaya muat disimpan sebagai
// data URL di database tanpa perlu layanan storage terpisah.
// Diekspor: dipakai juga form report pengiriman order.
export async function compressToDataUrl(
  file: File,
  maxSize = 512,
): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, h);
  return canvas.toDataURL("image/webp", 0.8);
}

// Dipakai di dalam <form>: pilih file -> preview + hidden input "imageUrl"
export function ProductImageInput() {
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setPreview(await compressToDataUrl(file));
  }

  return (
    <div className="flex items-center gap-2">
      <input type="hidden" name="imageUrl" value={preview ?? ""} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Preview foto barang"
            className="h-12 w-12 rounded-lg border border-neutral-200 object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setPreview(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
          >
            <X className="h-3.5 w-3.5" />
            Hapus foto
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
        >
          <ImagePlus className="h-3.5 w-3.5" />
          Foto barang (opsional)
        </button>
      )}
    </div>
  );
}

// Ganti/pasang foto barang yang sudah ada (dipakai di menu Data)
export function UpdateProductPhotoForm({ productId }: { productId: string }) {
  const action = updateProductImage.bind(null, productId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  const [preview, setPreview] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setPreview(await compressToDataUrl(file));
  }

  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="imageUrl" value={preview ?? ""} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="rounded-lg border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100"
        title="Pilih foto barang"
      >
        <ImagePlus className="h-3.5 w-3.5" />
      </button>
      {preview && (
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-neutral-900 px-2 py-1 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
        >
          {pending ? <Spinner className="h-3 w-3" /> : "Simpan"}
        </button>
      )}
      {state?.error && (
        <span className="text-xs text-red-600">{state.error}</span>
      )}
    </form>
  );
}
