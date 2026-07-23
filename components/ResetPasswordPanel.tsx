"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import {
  requestResetOtp,
  verifyResetOtp,
  confirmResetOtp,
} from "@/app/actions/auth";
import { PendingLabel } from "@/components/SubmitButton";
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MessageCircle,
  RotateCw,
  ShieldCheck,
} from "lucide-react";

const RESEND_SECONDS = 60;
const OTP_LEN = 6;

const inputCls =
  "w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm outline-none transition-colors placeholder:text-neutral-400 focus:border-neutral-900 focus:bg-white";

// 0812****7890 — cukup buat meyakinkan "ini nomor gw", tanpa memajang
// nomor utuh di layar.
function maskPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length < 8) return raw;
  return `${d.slice(0, 4)}${"*".repeat(d.length - 8)}${d.slice(-4)}`;
}

type Step = "phone" | "otp" | "password";
const STEPS: Step[] = ["phone", "otp", "password"];

// Lupa password, alur 3 langkah ala marketplace:
// 1. Nomor HP        → kode 6 digit dikirim via WhatsApp
// 2. Verifikasi kode → dicek server (kode belum dipakai habis)
// 3. Password baru   → kode dicek ulang, password diganti, langsung login
export function ResetPasswordPanel({ onBack }: { onBack: () => void }) {
  const [phone, setPhone] = useState("");
  const [reqState, reqAction, reqPending] = useActionState(
    requestResetOtp,
    null,
  );
  const [verState, verAction, verPending] = useActionState(
    verifyResetOtp,
    null,
  );
  const [confState, confAction, confPending] = useActionState(
    confirmResetOtp,
    null,
  );
  const [showPass, setShowPass] = useState(false);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [step, setStep] = useState<Step>("phone");
  const [left, setLeft] = useState(0);
  const [digits, setDigits] = useState<string[]>(Array(OTP_LEN).fill(""));
  const boxes = useRef<(HTMLInputElement | null)[]>([]);
  const otpForm = useRef<HTMLFormElement | null>(null);
  // Dinaikkan tiap kotak kode dikosongkan; dipakai sebagai bagian `key`
  // supaya inputnya remount → autoFocus balik ke kotak pertama (fokus tidak
  // boleh disetel manual saat render).
  const [attempt, setAttempt] = useState(0);

  const clearCode = () => {
    setDigits(Array(OTP_LEN).fill(""));
    setAttempt((n) => n + 1);
  };

  // Kode baru terkirim → ke langkah kode, kosongkan kotak, nyalakan hitung
  // mundur kirim ulang (reset saat render, bukan effect)
  const [seenReq, setSeenReq] = useState(reqState);
  if (reqState !== seenReq) {
    setSeenReq(reqState);
    if (reqState?.ok) {
      setStep("otp");
      clearCode();
      setLeft(RESEND_SECONDS);
    }
  }
  // Kode benar → lanjut isi password baru; salah → kosongkan kotak
  const [seenVer, setSeenVer] = useState(verState);
  if (verState !== seenVer) {
    setSeenVer(verState);
    if (verState?.ok) setStep("password");
    else if (verState?.error) clearCode();
  }
  // Simpan password gagal karena kodenya (kedaluwarsa saat ngetik password,
  // dll) → balik ke langkah kode, bukan mentok di layar password.
  const [seenConf, setSeenConf] = useState(confState);
  if (confState !== seenConf) {
    setSeenConf(confState);
    if (confState && "codeInvalid" in confState && confState.codeInvalid) {
      setStep("otp");
      clearCode();
    }
  }

  // Hitung mundur "kirim ulang" — setState-nya di dalam callback timer,
  // bukan di badan effect.
  useEffect(() => {
    if (left <= 0) return;
    const t = setTimeout(() => setLeft((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [left]);

  const code = digits.join("");
  const codeReady = code.length === OTP_LEN;

  // Kotak keenam terisi → langsung verifikasi, tanpa nunggu klik tombol
  useEffect(() => {
    if (step === "otp" && codeReady && !verPending) {
      otpForm.current?.requestSubmit();
    }
  }, [step, codeReady, verPending]);

  // Satu kotak bisa menerima tempelan beberapa digit sekaligus (paste kode
  // dari WA) — sisanya diisikan ke kotak berikutnya.
  function fillFrom(index: number, raw: string) {
    const d = raw.replace(/\D/g, "");
    const next = [...digits];
    if (!d) {
      next[index] = "";
      setDigits(next);
      return;
    }
    for (let i = 0; i < d.length && index + i < OTP_LEN; i++) {
      next[index + i] = d[i];
    }
    setDigits(next);
    boxes.current[Math.min(index + d.length, OTP_LEN - 1)]?.focus();
  }

  function onKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      e.preventDefault();
      const next = [...digits];
      next[index - 1] = "";
      setDigits(next);
      boxes.current[index - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && index > 0) boxes.current[index - 1]?.focus();
    if (e.key === "ArrowRight" && index < OTP_LEN - 1) {
      boxes.current[index + 1]?.focus();
    }
  }

  const stepNo = STEPS.indexOf(step) + 1;
  const passMismatch = pass2.length > 0 && pass !== pass2;
  const passReady = pass.length >= 4 && pass === pass2;

  const HEAD: Record<Step, { icon: typeof KeyRound; text: React.ReactNode }> = {
    phone: {
      icon: MessageCircle,
      text: "Masukkan nomor HP akunmu. Kami kirim kode verifikasi 6 digit lewat WhatsApp.",
    },
    otp: {
      icon: KeyRound,
      text: (
        <>
          Kode dikirim ke WhatsApp{" "}
          <span className="font-semibold text-neutral-900">
            {maskPhone(phone)}
          </span>
          . Berlaku 5 menit.
        </>
      ),
    },
    password: {
      icon: Lock,
      text: (
        <>
          <span className="inline-flex items-center gap-1 font-semibold text-neutral-900">
            <Check className="h-3.5 w-3.5" />
            Kode terverifikasi.
          </span>{" "}
          Sekarang buat password barumu.
        </>
      ),
    },
  };
  const HeadIcon = HEAD[step].icon;

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
      {/* Header: tombol kembali + indikator langkah */}
      <div className="flex items-center gap-3 border-b border-neutral-100 px-5 py-4">
        <button
          type="button"
          onClick={() =>
            step === "phone"
              ? onBack()
              : setStep(step === "password" ? "otp" : "phone")
          }
          aria-label="Kembali"
          className="-ml-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
        >
          <ArrowLeft className="h-4.5 w-4.5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Lupa Password</p>
          <p className="text-[11px] text-neutral-400">
            Langkah {stepNo} dari {STEPS.length}
          </p>
        </div>
        <div className="flex shrink-0 gap-1">
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 w-5 rounded-full transition-colors ${
                i < stepNo ? "bg-neutral-900" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        {/* Ikon + penjelasan langkah aktif */}
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand/20 text-neutral-900">
            <HeadIcon className="h-5 w-5" />
          </span>
          <p className="pt-0.5 text-sm leading-snug text-neutral-500">
            {HEAD[step].text}
          </p>
        </div>

        {/* ===== Langkah 1: nomor HP ===== */}
        {step === "phone" && (
          <form action={reqAction} className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Nomor HP
              </label>
              <input
                name="phone"
                type="text"
                inputMode="numeric"
                required
                autoFocus
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0812xxxxxxxx"
                className={inputCls}
              />
            </div>

            {reqState?.error && (
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm font-medium text-neutral-900">
                {reqState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={reqPending}
              className="w-full rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-60"
            >
              {reqPending ? (
                <PendingLabel text="Mengirim…" />
              ) : (
                "Kirim Kode via WhatsApp"
              )}
            </button>
          </form>
        )}

        {/* ===== Langkah 2: verifikasi kode ===== */}
        {step === "otp" && (
          <form ref={otpForm} action={verAction} className="space-y-3">
            <input type="hidden" name="phone" value={phone} />
            <input type="hidden" name="code" value={code} />

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Kode Verifikasi
              </label>
              <div className="flex justify-between gap-1.5">
                {digits.map((d, i) => (
                  <input
                    key={`${attempt}-${i}`}
                    ref={(el) => {
                      boxes.current[i] = el;
                    }}
                    value={d}
                    onChange={(e) => fillFrom(i, e.target.value)}
                    onKeyDown={(e) => onKeyDown(i, e)}
                    onFocus={(e) => e.target.select()}
                    disabled={verPending}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    aria-label={`Digit ke-${i + 1}`}
                    autoFocus={i === 0}
                    className={`h-12 w-full min-w-0 rounded-xl border text-center text-lg font-bold outline-none transition-colors disabled:opacity-60 ${
                      d
                        ? "border-neutral-900 bg-white text-neutral-900"
                        : "border-neutral-200 bg-neutral-50 text-neutral-900 focus:border-neutral-900 focus:bg-white"
                    }`}
                  />
                ))}
              </div>
            </div>

            {(verState?.error || confState?.error || reqState?.error) && (
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm font-medium text-neutral-900">
                {verState?.error ?? confState?.error ?? reqState?.error}
              </p>
            )}

            <button
              type="submit"
              disabled={verPending || !codeReady}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-neutral-900 py-3 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:opacity-50"
            >
              {verPending ? (
                <PendingLabel text="Memeriksa…" />
              ) : (
                <>
                  <ShieldCheck className="h-4 w-4" />
                  Verifikasi Kode
                </>
              )}
            </button>
          </form>
        )}

        {/* ===== Langkah 3: password baru ===== */}
        {step === "password" && (
          <form action={confAction} className="space-y-3">
            <input type="hidden" name="phone" value={phone} />
            <input type="hidden" name="code" value={code} />

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Password Baru
              </label>
              <div className="relative">
                <input
                  name="newPassword"
                  required
                  minLength={4}
                  autoFocus
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  type={showPass ? "text" : "password"}
                  autoComplete="new-password"
                  placeholder="Minimal 4 karakter"
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

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-neutral-500">
                Ulangi Password
              </label>
              <input
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                type={showPass ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Ketik ulang password barunya"
                className={`${inputCls} ${
                  passMismatch ? "border-neutral-900 bg-white" : ""
                }`}
              />
              {passMismatch && (
                <p className="mt-1.5 text-xs font-medium text-neutral-900">
                  Password belum sama.
                </p>
              )}
            </div>

            {confState?.error && (
              <p className="rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm font-medium text-neutral-900">
                {confState.error}
              </p>
            )}

            <button
              type="submit"
              disabled={confPending || !passReady}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand py-3 text-sm font-semibold text-neutral-900 transition hover:opacity-90 disabled:opacity-50"
            >
              {confPending ? (
                <PendingLabel text="Menyimpan…" />
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  Simpan &amp; Masuk
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Kaki kartu: kirim ulang kode (langkah kode) / balik ke login */}
      <div className="border-t border-neutral-100 bg-neutral-50/60 px-5 py-3.5 text-center text-sm">
        {step === "phone" ? (
          <button
            type="button"
            onClick={onBack}
            className="font-medium text-neutral-500 transition-colors hover:text-neutral-900"
          >
            Ingat passwordnya? Masuk
          </button>
        ) : step === "password" ? (
          <p className="text-neutral-400">
            Password lama langsung nggak berlaku setelah disimpan.
          </p>
        ) : left > 0 ? (
          <p className="text-neutral-400">
            Belum masuk? Kirim ulang dalam{" "}
            <span className="font-semibold tabular-nums text-neutral-900">
              0:{String(left).padStart(2, "0")}
            </span>
          </p>
        ) : (
          <form action={reqAction}>
            <input type="hidden" name="phone" value={phone} />
            <button
              type="submit"
              disabled={reqPending}
              className="inline-flex items-center gap-1.5 font-semibold text-neutral-900 transition-colors hover:text-neutral-600 disabled:opacity-60"
            >
              <RotateCw className="h-3.5 w-3.5" />
              {reqPending ? "Mengirim…" : "Kirim ulang kode"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
