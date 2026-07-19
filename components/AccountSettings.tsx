"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { X, KeyRound, Smartphone, CheckCircle2 } from "lucide-react";
import {
  changeOwnPassword,
  requestPhoneOtp,
  confirmPhoneOtp,
} from "@/app/actions/account";
import { PendingLabel } from "@/components/SubmitButton";

// Modal Ganti Password / Ganti No HP (dibuka dari dropdown nama di header,
// semua role). Ganti no HP dua langkah: kirim OTP via WA ke nomor baru,
// lalu masukkan kode 6 digit.

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";
const btnCls =
  "w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-semibold text-white hover:bg-neutral-800 disabled:opacity-60";

function ErrorMsg({ error }: { error?: string }) {
  if (!error) return null;
  return (
    <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
      {error}
    </p>
  );
}

function ModalShell({
  title,
  icon,
  onClose,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl border border-neutral-200 bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            {icon}
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [state, formAction, pending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await changeOwnPassword(fd)) ?? null,
    null,
  );

  return (
    <ModalShell
      title="Ganti Password"
      icon={<KeyRound className="h-4 w-4" />}
      onClose={onClose}
    >
      {state && "ok" in state && state.ok ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2.5 text-sm text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Password berhasil diganti.
          </p>
          <button type="button" onClick={onClose} className={btnCls}>
            Tutup
          </button>
        </div>
      ) : (
        <form action={formAction} className="space-y-2.5">
          <input
            name="oldPassword"
            type="password"
            required
            placeholder="Password lama"
            className={inputCls}
            autoFocus
          />
          <input
            name="newPassword"
            type="password"
            required
            minLength={6}
            placeholder="Password baru (min. 6 karakter)"
            className={inputCls}
          />
          <input
            name="confirmPassword"
            type="password"
            required
            placeholder="Ulangi password baru"
            className={inputCls}
          />
          <ErrorMsg error={state?.error} />
          <button disabled={pending} className={btnCls}>
            {pending ? <PendingLabel text="Menyimpan…" /> : "Simpan Password"}
          </button>
        </form>
      )}
    </ModalShell>
  );
}

export function ChangePhoneModal({
  currentPhone,
  onClose,
}: {
  currentPhone: string;
  onClose: () => void;
}) {
  const router = useRouter();

  const [reqState, reqAction, reqPending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await requestPhoneOtp(fd)) ?? null,
    null,
  );
  const [confState, confAction, confPending] = useActionState(
    async (_prev: unknown, fd: FormData) => (await confirmPhoneOtp(fd)) ?? null,
    null,
  );

  const sentTo =
    reqState && "ok" in reqState && reqState.ok ? reqState.target : null;
  const done = confState && "ok" in confState && confState.ok;

  return (
    <ModalShell
      title="Ganti No HP"
      icon={<Smartphone className="h-4 w-4" />}
      onClose={onClose}
    >
      {done ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2.5 text-sm text-white">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Nomor HP diganti ke {confState.phone}. Pakai nomor ini untuk login
            berikutnya.
          </p>
          <button
            type="button"
            onClick={() => {
              router.refresh();
              onClose();
            }}
            className={btnCls}
          >
            Tutup
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500">
            Nomor sekarang:{" "}
            <span className="font-medium text-neutral-900">{currentPhone}</span>
            <br />
            Nomor dipakai untuk login. Kode verifikasi dikirim via WhatsApp ke
            nomor baru.
          </p>

          {/* Langkah 1: nomor baru + kirim kode */}
          <form action={reqAction} className="space-y-2.5">
            <input
              name="newPhone"
              type="tel"
              required
              placeholder="No HP baru (mis. 08xxxxxxxxxx)"
              className={inputCls}
              autoFocus
            />
            <ErrorMsg error={reqState?.error} />
            <button
              disabled={reqPending}
              className={
                sentTo
                  ? "w-full rounded-lg border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                  : btnCls
              }
            >
              {reqPending ? (
                <PendingLabel text="Mengirim kode…" />
              ) : sentTo ? (
                "Kirim Ulang Kode"
              ) : (
                "Kirim Kode via WA"
              )}
            </button>
          </form>

          {/* Langkah 2: masukkan kode OTP */}
          {sentTo && (
            <form
              action={confAction}
              className="space-y-2.5 border-t border-neutral-200 pt-4"
            >
              <p className="text-sm text-neutral-500">
                Kode 6 digit sudah dikirim ke WA{" "}
                <span className="font-medium text-neutral-900">{sentTo}</span>{" "}
                (berlaku 5 menit).
              </p>
              <input
                name="code"
                required
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                placeholder="Kode 6 digit"
                className={`${inputCls} text-center text-lg font-semibold tracking-[0.4em]`}
              />
              <ErrorMsg error={confState?.error} />
              <button disabled={confPending} className={btnCls}>
                {confPending ? (
                  <PendingLabel text="Memverifikasi…" />
                ) : (
                  "Verifikasi & Ganti Nomor"
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </ModalShell>
  );
}
