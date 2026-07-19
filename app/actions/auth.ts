"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/auth";
import { sendWa } from "@/lib/wa-notify";
import {
  loginAllowed,
  recordLoginFail,
  clearLoginFails,
} from "@/lib/rate-limit";
import type { Role } from "@/lib/constants";

export async function login(_prev: unknown, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!phone || !password) {
    return { error: "Nomor HP dan password wajib diisi." };
  }

  if (!loginAllowed(phone)) {
    return {
      error: "Terlalu banyak percobaan gagal. Coba lagi 15 menit lagi.",
    };
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    recordLoginFail(phone);
    return { error: "Nomor HP atau password salah." };
  }
  clearLoginFails(phone);

  await createSession({
    userId: user.id,
    role: user.role as Role,
    name: user.name,
  });
  redirect("/dashboard");
}

export async function logout() {
  await destroySession();
  redirect("/login");
}

// ===== Lupa password (halaman login, tanpa sesi) =====
// Alur: masukkan no HP → kode 6 digit dikirim via WA (Fonnte) ke nomor
// akun itu → cocokkan kode + isi password baru → password diganti dan
// langsung login. Memakai kolom OTP yang sama dengan fitur ganti no HP
// (otpHash/otpExpiresAt/otpAttempts/otpSentAt); pendingPhone dibiarkan
// null sebagai penanda ini alur reset password.

const OTP_TTL_MS = 5 * 60 * 1000; // kode berlaku 5 menit
const OTP_RESEND_MS = 60 * 1000; // jeda minimal kirim ulang
const OTP_MAX_ATTEMPTS = 5; // salah 5x = wajib kirim ulang

export async function requestResetOtp(_prev: unknown, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return { error: "Isi nomor HP akunmu dulu." };

  if (!process.env.FONNTE_TOKEN) {
    return { error: "Pengiriman WA belum aktif — hubungi admin untuk reset." };
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user) return { error: "Nomor HP tidak terdaftar." };

  // Rate limit kirim ulang (samakan dengan OTP ganti nomor)
  if (user.otpSentAt) {
    const elapsed = Date.now() - user.otpSentAt.getTime();
    if (elapsed < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - elapsed) / 1000);
      return { error: `Tunggu ${wait} detik lagi untuk kirim ulang kode.` };
    }
  }

  const code = String(randomInt(100000, 1000000));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      pendingPhone: null,
      otpHash: await bcrypt.hash(code, 10),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      otpAttempts: 0,
      otpSentAt: new Date(),
    },
  });

  await sendWa(
    user.phone,
    [
      `Kode reset password Ugorex: ${code}`,
      ``,
      `Kode ini untuk mengganti password akun ${user.name}.`,
      `Berlaku 5 menit - jangan bagikan ke siapa pun.`,
      `Abaikan pesan ini kalau kamu tidak merasa meminta reset.`,
    ].join("\n"),
  );

  return { ok: true };
}

export async function confirmResetOtp(_prev: unknown, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!/^\d{6}$/.test(code)) return { error: "Kode harus 6 digit angka." };
  if (newPassword.length < 4) {
    return { error: "Password baru minimal 4 karakter." };
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.otpHash || !user.otpExpiresAt) {
    return { error: "Belum ada permintaan reset. Kirim kode dulu." };
  }
  if (user.otpExpiresAt.getTime() < Date.now()) {
    return { error: "Kode sudah kedaluwarsa. Kirim ulang kode." };
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return { error: "Terlalu banyak percobaan salah. Kirim ulang kode." };
  }

  const match = await bcrypt.compare(code, user.otpHash);
  if (!match) {
    await prisma.user.update({
      where: { id: user.id },
      data: { otpAttempts: { increment: 1 } },
    });
    const sisa = OTP_MAX_ATTEMPTS - user.otpAttempts - 1;
    return {
      error:
        sisa > 0
          ? `Kode salah. Sisa ${sisa} percobaan.`
          : "Kode salah. Kirim ulang kode untuk mencoba lagi.",
    };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      passwordHash: await bcrypt.hash(newPassword, 10),
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpSentAt: null,
    },
  });

  // Verif berhasil → langsung masuk dengan password baru
  clearLoginFails(phone);
  await createSession({
    userId: user.id,
    role: user.role as Role,
    name: user.name,
  });
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");
  redirect("/dashboard");
}
