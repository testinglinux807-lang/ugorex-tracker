"use client";

import { useActionState, useState, type ReactNode } from "react";
import { logout } from "@/app/actions/auth";
import { updateOwnDetails, updateOwnStore } from "@/app/actions/account";
import { SubmitButton, PendingLabel } from "@/components/SubmitButton";
import {
  ChangePasswordModal,
  ChangePhoneModal,
} from "@/components/AccountSettings";
import { GradeBadge, LevelBadge } from "@/components/Badge";
import type { Grade } from "@/lib/sales-grade";
import { waLink } from "@/lib/wa";
import {
  KeyRound,
  Smartphone,
  LogOut,
  ChevronRight,
  ChevronDown,
  Landmark,
  LocateFixed,
  MapPin,
  CheckCircle2,
  Store,
  MessageCircle,
  type LucideIcon,
} from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const cardCls = "rounded-2xl border border-neutral-200 bg-white p-5";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

// Baris menu ala halaman "Akun Saya" di app marketplace: icon + label kiri,
// chevron kanan, seluruh baris bisa ditekan.
function SettingsRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-neutral-800 hover:bg-neutral-50"
    >
      <Icon className="h-4 w-4 shrink-0 text-neutral-400" />
      <span className="flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-neutral-300" />
    </button>
  );
}

// Kartu yang bisa dibuka/tutup (tertutup secara default) - dipakai untuk
// form data tambahan (Data Tambahan, Toko Saya) biar tidak makan tempat.
// Animasi buka/tutup pakai trik grid-template-rows 0fr↔1fr (bukan
// max-height) - transisi mulus tanpa perlu ukur tinggi konten.
function CollapsibleCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={cardCls}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-neutral-500" />
        <h2 className="flex-1 font-semibold">{title}</h2>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-neutral-400 transition-transform duration-300 ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>
      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Halaman /profil: header identitas (avatar + nama + role + grade/level
// khusus sales), daftar pengaturan akun (ganti password/no HP), plus -
// khusus SALES/GUDANG - kartu data tambahan (no. rekening, titik
// rumah/gudang, NIK) yang bisa diisi sendiri tanpa perlu admin.
export function ProfileView({
  name,
  roleLabel,
  phone,
  extra,
  gradeInfo,
  store,
  contact,
}: {
  name: string;
  roleLabel: string;
  phone: string;
  extra: {
    locationLabel: string;
    showNik: boolean;
    bankAccount: string | null;
    nik: string | null;
    homeLat: number | null;
    homeLng: number | null;
  } | null;
  gradeInfo: { grade: string; level: number; levelName: string } | null;
  store: {
    storeName: string;
    address: string | null;
    ownerName: string | null;
    ownerPhone: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
  contact: {
    cs: { name: string; phone: string | null };
    sales: { name: string; phone: string } | null;
  } | null;
}) {
  const [modal, setModal] = useState<"password" | "phone" | null>(null);

  return (
    <div className="space-y-5">
      {/* Header identitas */}
      <div className={cardCls}>
        <div className="flex items-center gap-3">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand text-lg font-bold text-neutral-900">
            {initials(name)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold leading-tight">{name}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="shrink-0 rounded-full bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                {roleLabel}
              </span>
              <span className="truncate text-sm text-neutral-500">{phone}</span>
            </div>
            {gradeInfo && (
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <GradeBadge grade={gradeInfo.grade as Grade} />
                <LevelBadge level={gradeInfo.level} name={gradeInfo.levelName} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Pengaturan akun */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white">
        <div className="divide-y divide-neutral-100">
          <SettingsRow
            icon={KeyRound}
            label="Ganti Password"
            onClick={() => setModal("password")}
          />
          <SettingsRow
            icon={Smartphone}
            label="Ganti No HP"
            onClick={() => setModal("phone")}
          />
        </div>
      </div>

      {extra && <ExtraDataCard {...extra} />}

      {store && <StoreCard {...store} />}

      {contact && <ContactCard {...contact} />}

      {/* Keluar */}
      <form action={logout}>
        <SubmitButton
          pendingText="Keluar…"
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-white py-3 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <LogOut className="h-4 w-4" />
          Keluar
        </SubmitButton>
      </form>

      {modal === "password" && (
        <ChangePasswordModal onClose={() => setModal(null)} />
      )}
      {modal === "phone" && (
        <ChangePhoneModal currentPhone={phone} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function ExtraDataCard({
  locationLabel,
  showNik,
  bankAccount,
  nik,
  homeLat,
  homeLng,
}: {
  locationLabel: string;
  showNik: boolean;
  bankAccount: string | null;
  nik: string | null;
  homeLat: number | null;
  homeLng: number | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await updateOwnDetails(fd)) ?? null,
    null,
  );
  const [bankVal, setBankVal] = useState(bankAccount ?? "");
  const [nikVal, setNikVal] = useState(nik ?? "");
  const [lat, setLat] = useState(homeLat != null ? String(homeLat) : "");
  const [lng, setLng] = useState(homeLng != null ? String(homeLng) : "");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  // Baseline buat deteksi "belum ada yang diubah" — tombol Simpan pudar
  // (disabled) selagi form masih sama kayak baseline. Baseline digeser ke
  // nilai sekarang begitu simpan sukses (reset saat render, tanpa effect).
  const [baseline, setBaseline] = useState({
    bank: bankAccount ?? "",
    nik: nik ?? "",
    lat,
    lng,
  });
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok) setBaseline({ bank: bankVal, nik: nikVal, lat, lng });
  }
  const dirty =
    bankVal !== baseline.bank ||
    nikVal !== baseline.nik ||
    lat !== baseline.lat ||
    lng !== baseline.lng;

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
    <CollapsibleCard icon={Landmark} title="Data Tambahan">
      <p className="mb-4 text-xs text-neutral-400">
        Data ini kamu isi sendiri, tidak perlu lewat admin.
      </p>
      <form action={formAction} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            No. Rekening
          </label>
          <input
            name="bankAccount"
            value={bankVal}
            onChange={(e) => setBankVal(e.target.value)}
            placeholder="mis. BCA 1234567890 a.n. Budi Santoso"
            className={inputCls}
          />
        </div>

        {showNik && (
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              NIK KTP
            </label>
            <input
              name="nik"
              value={nikVal}
              onChange={(e) => setNikVal(e.target.value)}
              inputMode="numeric"
              maxLength={16}
              placeholder="16 digit"
              className={inputCls}
            />
          </div>
        )}

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            {locationLabel}
          </label>
          <div className="grid grid-cols-2 gap-2">
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
          {locError && (
            <p className="mt-1 text-xs font-medium text-red-600">{locError}</p>
          )}
          {!lat && !homeLat && (
            <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
              <MapPin className="h-3 w-3 shrink-0" /> Belum diisi.
            </p>
          )}
        </div>

        {state?.error && (
          <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Tersimpan.
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !dirty}
          className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan"}
        </button>
      </form>
    </CollapsibleCard>
  );
}

// Data toko (khusus OWNER, self-service): nama, alamat, titik lokasi peta,
// nama & no HP pemilik. Wilayah/area tetap admin-only (lihat updateOwnStore
// di actions/account.ts).
function StoreCard({
  storeName,
  address,
  ownerName,
  ownerPhone,
  lat,
  lng,
}: {
  storeName: string;
  address: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  lat: number | null;
  lng: number | null;
}) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await updateOwnStore(fd)) ?? null,
    null,
  );
  const [nameVal, setNameVal] = useState(storeName);
  const [addressVal, setAddressVal] = useState(address ?? "");
  const [ownerNameVal, setOwnerNameVal] = useState(ownerName ?? "");
  const [ownerPhoneVal, setOwnerPhoneVal] = useState(ownerPhone ?? "");
  const [storeLat, setStoreLat] = useState(lat != null ? String(lat) : "");
  const [storeLng, setStoreLng] = useState(lng != null ? String(lng) : "");
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);

  const [baseline, setBaseline] = useState({
    name: storeName,
    address: address ?? "",
    ownerName: ownerName ?? "",
    ownerPhone: ownerPhone ?? "",
    lat: storeLat,
    lng: storeLng,
  });
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.ok)
      setBaseline({
        name: nameVal,
        address: addressVal,
        ownerName: ownerNameVal,
        ownerPhone: ownerPhoneVal,
        lat: storeLat,
        lng: storeLng,
      });
  }
  const dirty =
    nameVal !== baseline.name ||
    addressVal !== baseline.address ||
    ownerNameVal !== baseline.ownerName ||
    ownerPhoneVal !== baseline.ownerPhone ||
    storeLat !== baseline.lat ||
    storeLng !== baseline.lng;

  function useMyLocation() {
    if (!navigator.geolocation) {
      setLocError("Perangkat tidak mendukung GPS.");
      return;
    }
    setLocError(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setStoreLat(pos.coords.latitude.toFixed(6));
        setStoreLng(pos.coords.longitude.toFixed(6));
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
    <CollapsibleCard icon={Store} title="Toko Saya">
      <p className="mb-4 text-xs text-neutral-400">
        Alamat & lokasi dipakai buat pengiriman dan peta. Wilayah/area cuma
        admin yang bisa ubah.
      </p>
      <form action={formAction} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Nama Toko
          </label>
          <input
            name="name"
            required
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            placeholder="Nama toko"
            className={inputCls}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Alamat
          </label>
          <input
            name="address"
            value={addressVal}
            onChange={(e) => setAddressVal(e.target.value)}
            placeholder="Alamat lengkap toko"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Nama Pemilik
            </label>
            <input
              name="ownerName"
              value={ownerNameVal}
              onChange={(e) => setOwnerNameVal(e.target.value)}
              placeholder="Nama pemilik toko"
              className={inputCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              No HP Pemilik
            </label>
            <input
              name="ownerPhone"
              value={ownerPhoneVal}
              onChange={(e) => setOwnerPhoneVal(e.target.value)}
              placeholder="08xxxxxxxxxx"
              className={inputCls}
            />
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700">
            Titik Lokasi Toko
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              name="lat"
              value={storeLat}
              onChange={(e) => setStoreLat(e.target.value)}
              placeholder="Latitude"
              inputMode="decimal"
              className={inputCls}
            />
            <input
              name="lng"
              value={storeLng}
              onChange={(e) => setStoreLng(e.target.value)}
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
          {locError && (
            <p className="mt-1 text-xs font-medium text-red-600">{locError}</p>
          )}
          {!storeLat && !lat && (
            <p className="mt-1 flex items-center gap-1 text-xs text-neutral-400">
              <MapPin className="h-3 w-3 shrink-0" /> Belum diisi.
            </p>
          )}
        </div>

        {state?.error && (
          <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
            {state.error}
          </p>
        )}
        {state?.ok && (
          <p className="flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Tersimpan.
          </p>
        )}

        <button
          type="submit"
          disabled={pending || !dirty}
          className="w-full rounded-lg bg-neutral-900 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan"}
        </button>
      </form>
    </CollapsibleCard>
  );
}

// Kontak bantuan (khusus OWNER): CS Ugorex (diatur admin) + sales pemegang
// tokonya sendiri - buat pertanyaan di luar urusan restok/POS sehari-hari.
function ContactRow({
  name,
  role,
  phone,
  message,
}: {
  name: string;
  role: string;
  phone: string | null;
  message: string;
}) {
  const link = waLink(phone, message);
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-neutral-200 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold text-neutral-900">{name}</p>
        <p className="text-xs text-neutral-400">{role}</p>
      </div>
      {link ? (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          Chat WA
        </a>
      ) : (
        <span className="shrink-0 text-xs text-neutral-400">Belum ada nomor</span>
      )}
    </div>
  );
}

function ContactCard({
  cs,
  sales,
}: {
  cs: { name: string; phone: string | null };
  sales: { name: string; phone: string } | null;
}) {
  return (
    <div className={cardCls}>
      <div className="mb-4 flex items-center gap-2">
        <MessageCircle className="h-4 w-4 shrink-0 text-neutral-500" />
        <h2 className="font-semibold">Hubungi CS</h2>
      </div>
      <div className="space-y-2">
        <ContactRow
          name={cs.name}
          role="Customer Service"
          phone={cs.phone}
          message={`Halo ${cs.name}, saya owner toko mau tanya-tanya.`}
        />
        {sales && (
          <ContactRow
            name={sales.name}
            role="Sales Penanggung Jawab"
            phone={sales.phone}
            message={`Halo ${sales.name}, saya owner toko mau tanya-tanya.`}
          />
        )}
      </div>
    </div>
  );
}
