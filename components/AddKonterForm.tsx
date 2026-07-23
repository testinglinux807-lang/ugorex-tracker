"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createStore } from "@/app/actions/tracker";
import { MapPin, LocateFixed } from "lucide-react";
import { PendingLabel } from "@/components/SubmitButton";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";

// `inline` = form dipasang di dalam /konter (panel lipat). Bedanya cuma
// setelah simpan: bukan pindah halaman, tapi reset form + refresh daftar.
export function AddKonterForm({ inline = false }: { inline?: boolean }) {
  const router = useRouter();
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Perangkat tidak mendukung GPS.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setError("Gagal ambil lokasi. Izinkan akses lokasi atau isi manual.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(null);
    setPending(true);
    const form = e.currentTarget;
    const fd = new FormData(form);
    try {
      await createStore(fd);
      if (inline) {
        // Tetap di /konter: bersihkan form, tampilkan konfirmasi, muat ulang
        // daftar konter di server component.
        form.reset();
        setLat("");
        setLng("");
        setSaved(String(fd.get("name") ?? "").trim() || "Konter");
        setPending(false);
        router.refresh();
      } else {
        router.push("/konter");
      }
    } catch {
      setError("Gagal menyimpan konter.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className={
        inline
          ? "space-y-3"
          : "space-y-3 rounded-xl border border-neutral-200 bg-white p-5"
      }
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Nama Konter <span className="text-neutral-900">*</span>
        </label>
        <input name="name" required placeholder="Mis. Konter Berkah" className={inputCls} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Kecamatan / Wilayah
          </label>
          <input name="area" placeholder="Mis. Klari" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Nama Owner
          </label>
          <input name="ownerName" placeholder="Nama pemilik" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            No HP Owner
          </label>
          <input name="ownerPhone" placeholder="08xxx" className={inputCls} />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Alamat
          </label>
          <input name="address" placeholder="Alamat konter" className={inputCls} />
        </div>
      </div>

      {/* Lokasi */}
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700">
          Lokasi (untuk peta)
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            name="lat"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            placeholder="Latitude"
            inputMode="decimal"
            className={inputCls}
          />
          <input
            name="lng"
            value={lng}
            onChange={(e) => setLng(e.target.value)}
            placeholder="Longitude"
            inputMode="decimal"
            className={inputCls}
          />
          <button
            type="button"
            onClick={useMyLocation}
            disabled={locating}
            className="flex shrink-0 items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
          >
            <LocateFixed className="h-4 w-4" />
            {locating ? "Mencari…" : "Lokasi saya"}
          </button>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
          <MapPin className="h-3 w-3" /> Konter dengan lokasi akan tampil di map
          tracker.
        </p>
      </div>

      {error && (
        <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
          {saved} tersimpan - sudah masuk daftar konter di bawah.
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Konter"}
      </button>
    </form>
  );
}
