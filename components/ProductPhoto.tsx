"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { updateProductImage } from "@/app/actions/tracker";
import { ImagePlus, X } from "lucide-react";
import { Spinner } from "@/components/SubmitButton";

// Cap teks (mis. timestamp) di pojok kiri-bawah foto — bukti serah terima
// jadi terlihat kapan diambil & lebih sulit dipalsukan pakai foto lama.
function drawStamp(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  text: string,
) {
  const pad = Math.max(4, Math.round(w * 0.02));
  const fontSize = Math.max(11, Math.round(w * 0.038));
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textBaseline = "middle";
  const textW = ctx.measureText(text).width;
  const boxH = fontSize + pad * 2;
  const boxW = Math.min(w, textW + pad * 2);
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, h - boxH, boxW, boxH);
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, pad, h - boxH / 2 + 1);
}

// Kompres foto di browser (WebP) supaya muat disimpan sebagai data URL di
// database tanpa perlu layanan storage terpisah.
// Diekspor: dipakai juga form report pengiriman order.
// opts.quality: kualitas WebP (default 0.8). opts.stamp: teks yang dibakar
// ke foto (mis. timestamp bukti serah terima).
// Pakai elemen <img> (bukan createImageBitmap) untuk decode — createImageBitmap
// sering gagal diam-diam di Safari/iOS untuk foto dari kamera.
export async function compressToDataUrl(
  file: File,
  maxSize = 512,
  opts: { quality?: number; stamp?: string } = {},
): Promise<string> {
  const { quality = 0.8, stamp } = opts;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () =>
        reject(new Error("Foto gagal dibaca, coba pilih foto lain."));
      el.src = url;
    });
    const scale = Math.min(
      1,
      maxSize / Math.max(img.naturalWidth, img.naturalHeight),
    );
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    if (stamp) drawStamp(ctx, w, h, stamp);
    return canvas.toDataURL("image/webp", quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Dipakai di dalam <form>: pilih file -> preview + hidden input "imageUrl"
export function ProductImageInput() {
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form induk pakai server action tanpa useActionState — React auto-reset
  // field teks setelah submit, tapi foto ini controlled (state) jadi harus
  // dibersihkan manual saat submit selesai (pending turun dari true ke false).
  const { pending } = useFormStatus();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      setPreview(null);
      setError(null);
      if (fileRef.current) fileRef.current.value = "";
    }
    wasPending.current = pending;
  }, [pending]);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      setPreview(await compressToDataUrl(file));
    } catch {
      setError("Foto gagal diproses, coba pilih foto lain.");
    }
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
      {error && <span className="text-xs text-red-600">{error}</span>}
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
  const [pickError, setPickError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setPickError(null);
    try {
      setPreview(await compressToDataUrl(file));
    } catch {
      setPickError("Foto gagal diproses, coba pilih foto lain.");
    }
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
      {(pickError || state?.error) && (
        <span className="text-xs text-red-600">
          {pickError || state?.error}
        </span>
      )}
    </form>
  );
}
