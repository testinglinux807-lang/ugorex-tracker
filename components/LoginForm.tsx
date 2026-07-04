"use client";

import Image from "next/image";
import { useActionState, useState } from "react";
import { login } from "@/app/actions/auth";
import { PendingLabel } from "@/components/SubmitButton";
import { Eye, EyeOff } from "lucide-react";

export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, null);
  const [showPass, setShowPass] = useState(false);

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
        </form>
      </div>
    </div>
  );
}
