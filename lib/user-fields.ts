import "server-only";
import { prisma } from "@/lib/prisma";

// Helper murni dipakai admin (actions/users.ts, actions/payroll.ts) dan
// self-service (actions/account.ts) - taruh di luar file "use server" biar
// tidak ikut dianggap Server Action (yang wajib async) oleh Next.js.

// NIK KTP dari form — opsional; kalau diisi harus 16 digit dan belum
// dipakai akun lain. Return { error } kalau tidak valid.
export async function parseNik(
  formData: FormData,
  excludeUserId?: string,
): Promise<{ nik?: string | null; error?: string }> {
  const nik = String(formData.get("nik") ?? "").replace(/\D/g, "");
  if (!nik) return { nik: null };
  if (nik.length !== 16) return { error: "NIK harus 16 digit angka." };
  const taken = await prisma.user.findFirst({
    where: { nik, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
    select: { name: true },
  });
  if (taken) return { error: `NIK sudah terdaftar atas nama ${taken.name}.` };
  return { nik };
}

// Batas ukuran foto KTP (data URL) ~1.1MB — lebih longgar dari foto produk
// (700KB) karena teks di KTP perlu resolusi lebih tinggi biar kebaca.
const MAX_KTP_PHOTO_LENGTH = 1_500_000;

// Foto KTP dari form registrasi sales — WAJIB diisi (beda dari NIK yang
// opsional). Return { error } kalau kosong/tidak valid.
export function parseKtpPhoto(
  formData: FormData,
): { url?: string; error?: string } {
  const raw = String(formData.get("ktpPhotoUrl") ?? "").trim();
  if (!raw) return { error: "Foto KTP wajib diunggah." };
  if (raw.length > MAX_KTP_PHOTO_LENGTH) {
    return { error: "Foto KTP terlalu besar, coba foto ulang." };
  }
  if (!raw.startsWith("data:image/")) return { error: "Foto KTP tidak valid." };
  return { url: raw };
}

// Titik rumah/gudang dari form (homeLat/homeLng) — dua-duanya harus terisi
// angka valid; selain itu dianggap tanpa titik (null).
export function parseHomePoint(formData: FormData) {
  const latRaw = String(formData.get("homeLat") ?? "").trim();
  const lngRaw = String(formData.get("homeLng") ?? "").trim();
  const lat = latRaw ? Number.parseFloat(latRaw.replace(",", ".")) : NaN;
  const lng = lngRaw ? Number.parseFloat(lngRaw.replace(",", ".")) : NaN;
  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return { homeLat: null, homeLng: null };
  }
  return { homeLat: lat, homeLng: lng };
}
