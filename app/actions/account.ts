"use server";

import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { sendWa } from "@/lib/wa-notify";
import { waNumber } from "@/lib/wa";

// Menu akun admin di header (klik nama → Ganti Password / Ganti No HP).
// Ganti password cukup verifikasi password lama; ganti no HP wajib OTP 6
// digit yang dikirim via WA (Fonnte) ke NOMOR BARU — sekalian membuktikan
// nomornya benar dan aktif, karena no HP dipakai sebagai username login.

const OTP_TTL_MS = 5 * 60 * 1000; // kode berlaku 5 menit
const OTP_RESEND_MS = 60 * 1000; // jeda minimal kirim ulang
const OTP_MAX_ATTEMPTS = 5; // salah 5x = wajib kirim ulang

export async function changeOwnPassword(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const oldPassword = String(formData.get("oldPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!oldPassword || !newPassword || !confirm) {
    return { error: "Semua field wajib diisi." };
  }
  if (newPassword.length < 6) {
    return { error: "Password baru minimal 6 karakter." };
  }
  if (newPassword !== confirm) {
    return { error: "Konfirmasi password baru tidak sama." };
  }

  const ok = await bcrypt.compare(oldPassword, user.passwordHash);
  if (!ok) return { error: "Password lama salah." };

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 10) },
  });
  return { ok: true };
}

// Langkah 1 ganti no HP: simpan nomor baru + kirim kode OTP ke nomor itu.
export async function requestPhoneOtp(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  if (!process.env.FONNTE_TOKEN) {
    return { error: "Pengiriman WA belum aktif (FONNTE_TOKEN kosong)." };
  }

  const newPhone = String(formData.get("newPhone") ?? "").trim();
  const intl = waNumber(newPhone);
  if (!intl || intl.length < 10 || intl.length > 15) {
    return { error: "Nomor HP tidak valid." };
  }
  if (newPhone === user.phone) {
    return { error: "Nomor sama dengan yang sekarang." };
  }

  const existing = await prisma.user.findUnique({
    where: { phone: newPhone },
  });
  if (existing && existing.id !== user.id) {
    return { error: "Nomor HP sudah dipakai akun lain." };
  }

  // Rate limit kirim ulang
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
      pendingPhone: newPhone,
      otpHash: await bcrypt.hash(code, 10),
      otpExpiresAt: new Date(Date.now() + OTP_TTL_MS),
      otpAttempts: 0,
      otpSentAt: new Date(),
    },
  });

  await sendWa(
    newPhone,
    [
      `Kode verifikasi Ugorex: ${code}`,
      ``,
      `Kode ini untuk mengganti nomor HP akun ${user.name}.`,
      `Berlaku 5 menit - jangan bagikan ke siapa pun.`,
    ].join("\n"),
  );

  return { ok: true, target: newPhone };
}

// Langkah 2: cocokkan kode → nomor baru resmi jadi nomor login.
export async function confirmPhoneOtp(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return { error: "Hanya admin." };

  const code = String(formData.get("code") ?? "").trim();
  if (!/^\d{6}$/.test(code)) return { error: "Kode harus 6 digit angka." };

  if (!user.pendingPhone || !user.otpHash || !user.otpExpiresAt) {
    return { error: "Belum ada permintaan ganti nomor. Kirim kode dulu." };
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

  // Jaga-jaga nomor keburu dipakai akun lain di antara langkah 1 dan 2
  const taken = await prisma.user.findUnique({
    where: { phone: user.pendingPhone },
  });
  if (taken && taken.id !== user.id) {
    return { error: "Nomor HP sudah dipakai akun lain." };
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      phone: user.pendingPhone,
      pendingPhone: null,
      otpHash: null,
      otpExpiresAt: null,
      otpAttempts: 0,
      otpSentAt: null,
    },
  });

  return { ok: true, phone: user.pendingPhone };
}
