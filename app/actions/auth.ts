"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/auth";
import { sendWa, isWaEnabled } from "@/lib/wa-notify";
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
  if (user.role === "GUDANG") redirect("/gudang");
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
// Namespace terpisah di pembatas percobaan supaya tidak bentrok dengan
// hitungan gagal login untuk nomor yang sama.
const RESET_KEY = (phone: string) => `reset:${phone}`;

export async function requestResetOtp(_prev: unknown, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  if (!phone) return { error: "Isi nomor HP akunmu dulu." };

  if (!isWaEnabled()) {
    return { error: "Pengiriman WA belum aktif - hubungi admin untuk reset." };
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
  // Batas jumlah permintaan kode per nomor (5 per 15 menit, pakai pembatas
  // yang sama dengan login). Tanpa ini jeda 60 detik masih memungkinkan
  // ~60 kode/jam ke satu nomor: korban dispam WA, kuota Fonnte terkuras,
  // dan penebak kode dapat jatah 5 percobaan baru tiap kali kirim ulang.
  if (!loginAllowed(RESET_KEY(phone))) {
    return {
      error: "Terlalu sering minta kode. Coba lagi sekitar 15 menit lagi.",
    };
  }

  const code = String(randomInt(100000, 1000000));
  const sent = await sendWa(
    user.phone,
    [
      `Kode reset password Ugorex: ${code}`,
      ``,
      `Kode ini untuk mengganti password akun ${user.name}.`,
      `Berlaku 5 menit - jangan bagikan ke siapa pun.`,
      `Abaikan pesan ini kalau kamu tidak merasa meminta reset.`,
    ].join("\n"),
  );
  // Kirim dulu, simpan belakangan: kalau Fonnte menolak (token salah, kuota
  // habis, device disconnect) jangan sampai UI bilang "kode terkirim"
  // sementara tidak ada WA yang masuk — dan otpSentAt tidak ikut terisi
  // supaya rate limit 60 detik tidak mengunci percobaan berikutnya.
  if (!sent) {
    return {
      error:
        "Gagal mengirim kode ke WhatsApp. Pastikan nomor aktif atau hubungi admin.",
    };
  }

  recordLoginFail(RESET_KEY(phone));
  await prisma.user.update({
    where: { id: user.id },
    data: {
      // null = penanda "ini OTP alur reset password". Wajib, karena kolom
      // OTP dipakai bergantian dengan alur ganti no HP (lihat checkResetOtp).
      pendingPhone: null,
      otpHash: await bcrypt.hash(code, 10),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      otpAttempts: 0,
      otpSentAt: new Date(),
    },
  });

  return { ok: true };
}

// Cek kode OTP milik `phone`, TANPA menghapusnya — dipakai langkah
// "Verifikasi Kode" yang sekarang terpisah dari langkah ganti password.
// Kodenya sengaja dibiarkan hidup supaya masih bisa dipakai confirmResetOtp
// di langkah berikutnya; percobaan salah tetap dihitung seperti biasa.
async function checkResetOtp(phone: string, code: string) {
  if (!/^\d{6}$/.test(code)) {
    return { error: "Kode harus 6 digit angka.", codeInvalid: true as const };
  }

  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !user.otpHash || !user.otpExpiresAt) {
    return {
      error: "Belum ada permintaan reset. Kirim kode dulu.",
      codeInvalid: true as const,
    };
  }
  // Kolom OTP dipakai bergantian oleh dua alur: reset password (pendingPhone
  // null) dan ganti no HP (pendingPhone = nomor baru). Tanpa cek ini, kode
  // yang dikirim ke NOMOR BARU pada alur ganti HP bisa ditukar jadi reset
  // password — orang yang cuma numpang HP yang masih login bisa ambil alih
  // akun tanpa tahu password lama. confirmPhoneOtp sudah punya cek kebalikannya.
  if (user.pendingPhone) {
    return {
      error: "Kode ini untuk ganti nomor HP, bukan reset password.",
      codeInvalid: true as const,
    };
  }
  if (user.otpExpiresAt.getTime() < Date.now()) {
    return {
      error: "Kode sudah kedaluwarsa. Kirim ulang kode.",
      codeInvalid: true as const,
    };
  }
  if (user.otpAttempts >= OTP_MAX_ATTEMPTS) {
    return {
      error: "Terlalu banyak percobaan salah. Kirim ulang kode.",
      codeInvalid: true as const,
    };
  }

  if (!(await bcrypt.compare(code, user.otpHash))) {
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
      codeInvalid: true as const,
    };
  }

  return { user };
}

// Langkah 2: cocokkan kode saja. Belum mengubah apa pun — cuma "tiket"
// buat lanjut ke layar password baru.
export async function verifyResetOtp(_prev: unknown, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();

  const res = await checkResetOtp(phone, code);
  if ("error" in res) return { error: res.error };
  return { ok: true };
}

// Langkah 3: kode dicek ULANG (client tidak dipercaya) lalu password
// diganti dan langsung login.
export async function confirmResetOtp(_prev: unknown, formData: FormData) {
  const phone = String(formData.get("phone") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const newPassword = String(formData.get("newPassword") ?? "");

  if (newPassword.length < 4) {
    return { error: "Password baru minimal 4 karakter." };
  }

  const res = await checkResetOtp(phone, code);
  if ("error" in res) return { error: res.error, codeInvalid: true };
  const { user } = res;

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
  clearLoginFails(RESET_KEY(phone));
  await createSession({
    userId: user.id,
    role: user.role as Role,
    name: user.name,
  });
  if (user.role === "OWNER") redirect("/pos");
  if (user.role === "SALES") redirect("/beranda");
  if (user.role === "GUDANG") redirect("/gudang");
  redirect("/dashboard");
}
