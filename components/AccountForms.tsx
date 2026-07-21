"use client";

import { useActionState, useState } from "react";
import {
  createOwnerAccount,
  createSalesAccount,
  createGudangAccount,
} from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";
import { LocateFixed, MapPin } from "lucide-react";

const inputCls = "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm";
const btnCls =
  "rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60";

function Msg({ state }: { state: { error?: string; ok?: boolean } | null }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
        {state.error}
      </p>
    );
  if (state.ok)
    return (
      <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
        Akun berhasil dibuat.
      </p>
    );
  return null;
}

export function CreateOwnerForm({ storeId }: { storeId: string }) {
  const action = createOwnerAccount.bind(null, storeId);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  return (
    <form action={formAction} className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input name="name" required placeholder="Nama owner" className={inputCls} />
      <input name="phone" required placeholder="No HP (login)" className={inputCls} />
      <input name="password" required placeholder="Password" className={inputCls} />
      <div className="sm:col-span-3">
        <Msg state={state} />
      </div>
      <button disabled={pending} className={`${btnCls} sm:col-span-3`}>
        {pending ? <PendingLabel text="Membuat…" /> : "Buat Akun Owner"}
      </button>
    </form>
  );
}

export function CreateSalesForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createSalesAccount(fd)) ?? null,
    null,
  );
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Perangkat tidak mendukung GPS.");
      return;
    }
    setLocError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocError("Gagal ambil lokasi. Izinkan akses lokasi atau isi manual.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input name="name" required placeholder="Nama sales" className={inputCls} />
      <input name="phone" required placeholder="No HP (login)" className={inputCls} />
      <input name="password" required placeholder="Password" className={inputCls} />
      <input
        name="nik"
        placeholder="NIK KTP (16 digit, opsional)"
        inputMode="numeric"
        maxLength={16}
        className={`${inputCls} sm:col-span-3`}
      />
      <input
        name="bankAccount"
        placeholder="No. rekening (mis. BCA 1234567890 a.n. Budi, opsional)"
        className={`${inputCls} sm:col-span-3`}
      />

      {/* Titik rumah sales — pusat radius kerja 7 km di peta berandanya */}
      <input
        name="homeLat"
        value={lat}
        onChange={(e) => setLat(e.target.value)}
        placeholder="Latitude rumah"
        inputMode="decimal"
        className={inputCls}
      />
      <input
        name="homeLng"
        value={lng}
        onChange={(e) => setLng(e.target.value)}
        placeholder="Longitude rumah"
        inputMode="decimal"
        className={inputCls}
      />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="flex items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
      >
        <LocateFixed className="h-4 w-4" />
        {locating ? "Mencari…" : "Lokasi saya"}
      </button>
      <p className="flex items-center gap-1 text-xs text-neutral-400 sm:col-span-3">
        <MapPin className="h-3 w-3 shrink-0" /> Titik rumah = pusat radius
        kerja 7 km di peta beranda sales (opsional, bisa diisi belakangan di
        Data → Akun Sales).
      </p>
      {locError && (
        <p className="text-xs font-medium text-red-600 sm:col-span-3">
          {locError}
        </p>
      )}

      <div className="sm:col-span-3">
        <Msg state={state} />
      </div>
      <button disabled={pending} className={`${btnCls} sm:col-span-3`}>
        {pending ? <PendingLabel text="Membuat…" /> : "Tambah Sales"}
      </button>
    </form>
  );
}

export function CreateGudangForm() {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await createGudangAccount(fd)) ?? null,
    null,
  );
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Perangkat tidak mendukung GPS.");
      return;
    }
    setLocError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setLocating(false);
      },
      () => {
        setLocError("Gagal ambil lokasi. Izinkan akses lokasi atau isi manual.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  return (
    <form action={formAction} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <input name="name" required placeholder="Nama karyawan" className={inputCls} />
      <input name="phone" required placeholder="No HP (login)" className={inputCls} />
      <input name="password" required placeholder="Password" className={inputCls} />
      <input
        name="basePay"
        type="number"
        min={0}
        placeholder="Gaji pokok (Rp)"
        className={inputCls}
      />
      <input
        name="bankAccount"
        placeholder="No. rekening (opsional)"
        className={`${inputCls} sm:col-span-2`}
      />

      {/* Titik gudang — dasar penugasan paket terdekat dari sales pemegang toko */}
      <input
        name="homeLat"
        value={lat}
        onChange={(e) => setLat(e.target.value)}
        placeholder="Latitude gudang"
        inputMode="decimal"
        className={inputCls}
      />
      <input
        name="homeLng"
        value={lng}
        onChange={(e) => setLng(e.target.value)}
        placeholder="Longitude gudang"
        inputMode="decimal"
        className={inputCls}
      />
      <button
        type="button"
        onClick={useMyLocation}
        disabled={locating}
        className="flex items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
      >
        <LocateFixed className="h-4 w-4" />
        {locating ? "Mencari…" : "Lokasi saya"}
      </button>
      <p className="flex items-center gap-1 text-xs text-neutral-400 sm:col-span-3">
        <MapPin className="h-3 w-3 shrink-0" /> Titik gudang = dasar penugasan
        paket terdekat (opsional, bisa diisi belakangan di Data → Akun
        Gudang).
      </p>
      {locError && (
        <p className="text-xs font-medium text-red-600 sm:col-span-3">
          {locError}
        </p>
      )}

      <div className="sm:col-span-3">
        <Msg state={state} />
      </div>
      <button disabled={pending} className={`${btnCls} sm:col-span-3`}>
        {pending ? <PendingLabel text="Membuat…" /> : "Tambah Karyawan Gudang"}
      </button>
    </form>
  );
}
