"use server";

import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { LOG_TYPES } from "@/lib/payroll";
import { PAYROLL_KEYS } from "@/lib/payroll-config";
import { GUDANG_RADIUS_KEY } from "@/lib/gudang-assign";

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "ADMIN") return null;
  return user;
}

async function requireGudang() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "GUDANG") return null;
  return user;
}

// ===== Gaji pokok + lokasi karyawan gudang (admin) =====
export async function updateGudang(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Karyawan tidak ditemukan." };
  const basePay = Math.max(0, Math.round(Number(formData.get("basePay") ?? 0)));

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target || target.role !== "GUDANG")
    return { error: "Karyawan gudang tidak ditemukan." };

  // Koordinat: kedua isi → update; kedua kosong → biarkan; salah satu → error
  const latRaw = String(formData.get("homeLat") ?? "").trim();
  const lngRaw = String(formData.get("homeLng") ?? "").trim();
  const coord: { homeLat?: number; homeLng?: number } = {};
  if (latRaw || lngRaw) {
    const lat = Number(latRaw);
    const lng = Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng))
      return { error: "Koordinat tidak valid." };
    coord.homeLat = lat;
    coord.homeLng = lng;
  }

  await prisma.user.update({ where: { id }, data: { basePay, ...coord } });
  revalidatePath("/payroll");
  revalidatePath("/order");
  return { ok: true };
}

export async function setGudangRadius(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };
  const km = Number(formData.get("radiusKm") ?? 0);
  if (!Number.isFinite(km) || km <= 0) return { error: "Radius tidak valid." };
  await prisma.config.upsert({
    where: { key: GUDANG_RADIUS_KEY },
    update: { value: String(km) },
    create: { key: GUDANG_RADIUS_KEY, value: String(km) },
  });
  revalidatePath("/payroll");
  revalidatePath("/order");
  return { ok: true };
}

// ===== Potongan (telat / kasbon / absen) — admin catat per karyawan =====
export async function addLog(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Pilih karyawan dulu." };
  const type = String(formData.get("type") ?? "").trim();
  if (!LOG_TYPES.includes(type as (typeof LOG_TYPES)[number]))
    return { error: "Jenis tidak valid." };
  const amount = Math.round(Number(formData.get("amount") ?? 0));
  if (!Number.isFinite(amount) || amount <= 0)
    return { error: "Jumlah harus lebih dari 0." };

  const dateRaw = String(formData.get("date") ?? "").trim();
  const date = dateRaw ? new Date(`${dateRaw}T00:00:00+07:00`) : new Date();
  if (isNaN(date.getTime())) return { error: "Tanggal tidak valid." };
  const note = String(formData.get("note") ?? "").trim() || null;

  await prisma.payrollLog.create({
    data: { userId, type, amount, date, note, createdById: user.id },
  });
  revalidatePath("/payroll");
  return { ok: true };
}

// ===== Lembur diatur ADMIN (jam per tanggal) — bukan clock-in gudang =====
export async function addLembur(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };

  const userId = String(formData.get("userId") ?? "").trim();
  if (!userId) return { error: "Pilih karyawan dulu." };
  const jam = Number(formData.get("jam") ?? 0);
  if (!Number.isFinite(jam) || jam <= 0)
    return { error: "Jam lembur harus lebih dari 0." };

  const dateRaw = String(formData.get("date") ?? "").trim();
  const startAt = dateRaw ? new Date(`${dateRaw}T00:00:00+07:00`) : new Date();
  if (isNaN(startAt.getTime())) return { error: "Tanggal tidak valid." };
  const endAt = new Date(startAt.getTime() + jam * 3_600_000);
  const note = String(formData.get("note") ?? "").trim() || null;

  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target || target.role !== "GUDANG")
    return { error: "Karyawan gudang tidak ditemukan." };

  await prisma.lemburSession.create({
    data: { userId, startAt, endAt, note },
  });
  revalidatePath("/payroll");
  return { ok: true };
}

export async function deleteLog(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Data tidak ditemukan." };
  await prisma.payrollLog.delete({ where: { id } });
  revalidatePath("/payroll");
  return { ok: true };
}

// ===== Lembur clock-in / clock-out (karyawan GUDANG sendiri) =====
export async function startLembur() {
  const user = await requireGudang();
  if (!user) return { error: "Hanya karyawan gudang." };

  const open = await prisma.lemburSession.findFirst({
    where: { userId: user.id, endAt: null },
    select: { id: true },
  });
  if (open) return { error: "Lembur sedang berjalan — selesaikan dulu." };

  await prisma.lemburSession.create({ data: { userId: user.id } });
  revalidatePath("/lembur");
  return { ok: true };
}

export async function stopLembur() {
  const user = await requireGudang();
  if (!user) return { error: "Hanya karyawan gudang." };

  const open = await prisma.lemburSession.findFirst({
    where: { userId: user.id, endAt: null },
    orderBy: { startAt: "desc" },
    select: { id: true },
  });
  if (!open) return { error: "Tidak ada lembur berjalan." };

  await prisma.lemburSession.update({
    where: { id: open.id },
    data: { endAt: new Date() },
  });
  revalidatePath("/lembur");
  revalidatePath("/payroll");
  return { ok: true };
}

// Batalkan sesi lembur berjalan (salah pencet) — tanpa mencatat jam.
export async function cancelLembur() {
  const user = await requireGudang();
  if (!user) return { error: "Hanya karyawan gudang." };
  const open = await prisma.lemburSession.findFirst({
    where: { userId: user.id, endAt: null },
    orderBy: { startAt: "desc" },
    select: { id: true },
  });
  if (!open) return { error: "Tidak ada lembur berjalan." };
  await prisma.lemburSession.delete({ where: { id: open.id } });
  revalidatePath("/lembur");
  return { ok: true };
}

// Admin hapus sesi lembur (koreksi) dari halaman Payroll.
export async function deleteLemburSession(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };
  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { error: "Sesi tidak ditemukan." };
  await prisma.lemburSession.delete({ where: { id } });
  revalidatePath("/payroll");
  return { ok: true };
}

// ===== Setelan payroll =====
export async function setPayrollConfig(formData: FormData) {
  const user = await requireAdmin();
  if (!user) return { error: "Hanya admin." };

  const fields: [string, string][] = [
    [PAYROLL_KEYS.lemburTarif, "lemburTarif"],
    [PAYROLL_KEYS.bonusKpi, "bonusKpi"],
    [PAYROLL_KEYS.kpiMin, "kpiMin"],
  ];
  // Hanya update field yang dikirim form ini — jadi form Sales (bonus/kpi)
  // & form Gudang (tarif lembur) bisa terpisah tanpa saling menimpa.
  const ops = fields
    .filter(([, field]) => formData.has(field))
    .map(([key, field]) => {
      const val = Math.max(0, Math.round(Number(formData.get(field) ?? 0)));
      return prisma.config.upsert({
        where: { key },
        update: { value: String(val) },
        create: { key, value: String(val) },
      });
    });
  if (ops.length > 0) await prisma.$transaction(ops);
  revalidatePath("/payroll");
  return { ok: true };
}
