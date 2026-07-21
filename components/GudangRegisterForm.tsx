"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { registerGudangViaInvite } from "@/app/actions/users";
import { PendingLabel } from "@/components/SubmitButton";
import { Eye, EyeOff, LocateFixed, MapPin } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

// Form registrasi gudang via link undangan (/daftar-gudang/[token]) — diisi
// calon karyawan dari HP-nya sendiri; tombol GPS menandai titik gudang
// (dasar penugasan paket terdekat dari sales pemegang toko).
export function GudangRegisterForm({ token }: { token: string }) {
  const action = registerGudangViaInvite.bind(null, token);
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await action(fd)) ?? null,
    null,
  );
  const [showPass, setShowPass] = useState(false);
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
    <div className="flex min-h-screen flex-1 items-center justify-center bg-white p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Image
            src="/logo.webp"
            alt="Ugorex"
            width={342}
            height={360}
            priority
            className="mx-auto mb-2 h-24 w-auto"
          />
          <h1 className="text-lg font-bold">Registrasi Gudang</h1>
          <p className="text-sm text-neutral-500">
            Isi data diri kamu untuk bergabung sebagai karyawan gudang Ugorex
          </p>
        </div>

        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Nama Lengkap <span className="text-neutral-900">*</span>
            </label>
            <input name="name" required placeholder="Nama kamu" className={inputCls} />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Nomor HP (untuk login) <span className="text-neutral-900">*</span>
            </label>
            <input
              name="phone"
              required
              inputMode="numeric"
              autoComplete="username"
              placeholder="0812..."
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Password <span className="text-neutral-900">*</span>
            </label>
            <div className="relative">
              <input
                name="password"
                required
                type={showPass ? "text" : "password"}
                autoComplete="new-password"
                placeholder="••••••••"
                className={`${inputCls} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={
                  showPass ? "Sembunyikan password" : "Tampilkan password"
                }
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-neutral-400 hover:text-neutral-900"
              >
                {showPass ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              No. Rekening
            </label>
            <input
              name="bankAccount"
              placeholder="mis. BCA 1234567890 a.n. Budi Santoso"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-neutral-400">
              Buat transfer gaji - boleh diisi belakangan.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Titik Gudang
            </label>
            <div className="flex gap-2">
              <input
                name="homeLat"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                placeholder="Latitude"
                inputMode="decimal"
                className={inputCls}
              />
              <input
                name="homeLng"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                placeholder="Longitude"
                inputMode="decimal"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={useMyLocation}
              disabled={locating}
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
            >
              <LocateFixed className="h-4 w-4" />
              {locating ? "Mencari…" : "Pakai lokasi saya sekarang"}
            </button>
            <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
              <MapPin className="h-3 w-3 shrink-0" /> Tekan tombolnya saat kamu
              di gudang - dasar penugasan paket terdekat dari toko/sales.
            </p>
            {locError && (
              <p className="mt-1 text-xs font-medium text-red-600">{locError}</p>
            )}
          </div>

          {state?.error && (
            <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-lg bg-neutral-900 py-2.5 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
          >
            {pending ? <PendingLabel text="Mendaftar…" /> : "Daftar & Masuk"}
          </button>
        </form>
      </div>
    </div>
  );
}
