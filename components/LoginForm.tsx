"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { login } from "@/app/actions/auth";
import { PendingLabel } from "@/components/SubmitButton";
import { ResetPasswordPanel } from "@/components/ResetPasswordPanel";
import { Eye, EyeOff } from "lucide-react";

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white";

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
          <ResetPasswordPanel onBack={() => setResetMode(false)} />
        ) : (
          <form
            action={formAction}
            className="space-y-4 rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm"
          >
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Nomor HP
              </label>
              <input
                name="phone"
                type="text"
                inputMode="numeric"
                autoComplete="username"
                placeholder="0812xxxxxxxx"
                className={inputCls}
              />
            </div>
            <div>
              <div className="mb-1.5 flex items-baseline justify-between gap-2">
                <label className="block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setResetMode(true)}
                  className="text-xs font-semibold text-neutral-900 underline-offset-2 hover:underline"
                >
                  Lupa password?
                </button>
              </div>
              <div className="relative">
                <input
                  name="password"
                  type={showPass ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${inputCls} pr-11`}
                />
                <button
                  type="button"
                  onClick={() => setShowPass((v) => !v)}
                  aria-label={
                    showPass ? "Sembunyikan password" : "Tampilkan password"
                  }
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-neutral-400 transition-colors hover:text-neutral-900"
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
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm font-medium text-neutral-900">
                {state.error}
              </p>
            )}

            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              {pending ? <PendingLabel text="Memproses…" /> : "Masuk"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
