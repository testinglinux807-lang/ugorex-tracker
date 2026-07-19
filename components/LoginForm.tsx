"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { login, requestResetOtp, confirmResetOtp } from "@/app/actions/auth";
import { PendingLabel } from "@/components/SubmitButton";
import { ArrowLeft, Eye, EyeOff } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900";

// Panel lupa password: kirim kode WA → verifikasi + password baru →
// langsung login (redirect dari server action).
function ResetPanel({ onBack }: { onBack: () => void }) {
  const [phone, setPhone] = useState("");
  const [reqState, reqAction, reqPending] = useActionState(requestResetOtp, null);
  const [confState, confAction, confPending] = useActionState(
    confirmResetOtp,
    null,
  );
  const [showPass, setShowPass] = useState(false);
  const sent = !!reqState?.ok;

  return (
    <div className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
      <div>
        <h2 className="font-semibold">Lupa Password</h2>
        <p className="mt-0.5 text-xs text-neutral-400">
          {sent
            ? "Kode 6 digit sudah dikirim via WhatsApp — masukkan kode & password barumu."
            : "Masukkan nomor HP akunmu — kode verifikasi dikirim via WhatsApp."}
        </p>
      </div>

      {/* Langkah 1: kirim kode ke WA */}
      <form action={reqAction} className="space-y-2">
        <input
          name="phone"
          type="text"
          inputMode="numeric"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Nomor HP akun (0812...)"
          className={inputCls}
        />
        {reqState?.error && (
          <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
            {reqState.error}
          </p>
        )}
        {sent && (
          <p className="rounded-lg border border-neutral-900 bg-neutral-900 px-3 py-2 text-sm text-white">
            Kode terkirim ke WhatsApp {phone}.
          </p>
        )}
        <button
          type="submit"
          disabled={reqPending}
          className={`w-full rounded-lg py-2 text-sm font-semibold disabled:opacity-60 ${
            sent
              ? "border border-neutral-300 text-neutral-600 hover:bg-neutral-100"
              : "bg-neutral-900 text-white hover:bg-neutral-800"
          }`}
        >
          {reqPending ? (
            <PendingLabel text="Mengirim…" />
          ) : sent ? (
            "Kirim ulang kode"
          ) : (
            "Kirim Kode via WhatsApp"
          )}
        </button>
      </form>

      {/* Langkah 2: verifikasi kode + password baru */}
      {sent && (
        <form
          action={confAction}
          className="space-y-2 border-t border-neutral-100 pt-3"
        >
          <input type="hidden" name="phone" value={phone} />
          <input
            name="code"
            required
            inputMode="numeric"
            maxLength={6}
            placeholder="Kode 6 digit dari WA"
            className={`${inputCls} text-center text-lg tracking-[0.4em]`}
          />
          <div className="relative">
            <input
              name="newPassword"
              required
              type={showPass ? "text" : "password"}
              autoComplete="new-password"
              placeholder="Password baru"
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
          {confState?.error && (
            <p className="rounded-lg border border-neutral-300 bg-neutral-100 px-3 py-2 text-sm font-medium text-neutral-900">
              {confState.error}
            </p>
          )}
          <button
            type="submit"
            disabled={confPending}
            className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-neutral-900 hover:opacity-90 disabled:opacity-60"
          >
            {confPending ? (
              <PendingLabel text="Memverifikasi…" />
            ) : (
              "Verifikasi & Masuk"
            )}
          </button>
        </form>
      )}

      <button
        type="button"
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-neutral-500 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali ke login
      </button>
    </div>
  );
}

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);
  const [showPass, setShowPass] = useState(false);
  const [resetMode, setResetMode] = useState(false);

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
          <h1 className="sr-only">Ugorex Tracker</h1>
          <p className="text-sm text-neutral-500">Selamat datang di Ugorex</p>
        </div>

        {resetMode ? (
          <ResetPanel onBack={() => setResetMode(false)} />
        ) : (
        <form
          action={formAction}
          className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Nomor HP
            </label>
            <input
              name="phone"
              type="text"
              inputMode="numeric"
              autoComplete="username"
              placeholder="0812..."
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">
              Password
            </label>
            <div className="relative">
              <input
                name="password"
                type={showPass ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full rounded-lg border border-neutral-300 py-2 pl-3 pr-10 text-sm outline-none focus:border-neutral-900"
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
            {pending ? <PendingLabel text="Memproses…" /> : "Masuk"}
          </button>

          <button
            type="button"
            onClick={() => setResetMode(true)}
            className="block w-full text-center text-sm text-neutral-500 hover:underline"
          >
            Lupa password?
          </button>
        </form>
        )}
      </div>
    </div>
  );
}
