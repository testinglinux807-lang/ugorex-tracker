"use client";

import { useActionState, useRef, useState } from "react";
import { completeOrderWithReport } from "@/app/actions/requests";
import { compressToDataUrl } from "@/components/ProductPhoto";
import { Camera, PackageCheck, X } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";
import { LoadingOverlay } from "@/components/LoadingOverlay";

// Report pengiriman: sales/admin foto barang yang sampai + keterangan →
// order selesai & stok pindah ke toko. Bukti tampil di kartu order owner.
export function DeliveryReportForm({ orderId }: { orderId: string }) {
  const action = completeOrderWithReport.bind(null, orderId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  const [open, setOpen] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPick(file: File | undefined) {
    if (!file) return;
    setPhoto(await compressToDataUrl(file, 800));
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-neutral-800"
      >
        <PackageCheck className="h-3.5 w-3.5" />
        Barang Sampai
      </button>
    );
  }

  return (
    <form
      action={formAction}
      className="w-full space-y-2 rounded-xl border border-neutral-200 bg-white p-3"
    >
      {pending && <LoadingOverlay text="Mengirim report…" />}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-neutral-700">
          Report Pengiriman
        </p>
        <button
          type="button"
          onClick={() => setOpen(false)}
          disabled={pending}
          className="rounded-lg p-1 text-neutral-400 hover:bg-neutral-100"
          aria-label="Tutup report"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <input type="hidden" name="photo" value={photo ?? ""} />
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onPick(e.target.files?.[0])}
      />
      {photo ? (
        <div className="flex items-center gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photo}
            alt="Foto barang sampai"
            className="h-16 w-16 rounded-lg border border-neutral-200 object-cover"
          />
          <button
            type="button"
            onClick={() => {
              setPhoto(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="inline-flex items-center gap-1 rounded-lg border border-neutral-300 px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100"
          >
            <X className="h-3.5 w-3.5" />
            Ganti foto
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-neutral-300 py-3 text-xs font-medium text-neutral-500 hover:bg-neutral-50"
        >
          <Camera className="h-4 w-4" />
          Foto barang yang diserahkan
        </button>
      )}

      <textarea
        name="note"
        rows={2}
        placeholder="Keterangan (mis. diterima langsung Bu Sari)"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
      />

      {state?.error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-xs font-medium text-neutral-900">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || !photo}
        className="w-full rounded-lg bg-brand py-2 text-xs font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
      >
        {pending ? (
          <PendingLabel text="Mengirim report…" />
        ) : (
          "Selesaikan & Kirim Stok"
        )}
      </button>
      {!photo && (
        <p className="text-center text-[11px] text-neutral-400">
          Foto barang wajib sebagai bukti serah terima
        </p>
      )}
    </form>
  );
}
