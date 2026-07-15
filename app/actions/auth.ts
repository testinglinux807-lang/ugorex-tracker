"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSession, destroySession } from "@/lib/auth";
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
