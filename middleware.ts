import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify, SignJWT } from "jose";

// Tanpa AUTH_SECRET di production, JWT bisa dipalsukan siapa pun yang tahu
// fallback dev — lebih baik gagal keras daripada jalan dengan pintu terbuka.
if (!process.env.AUTH_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("AUTH_SECRET wajib di-set di production.");
}
const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "ugorex-dev-secret",
);

// /api/midtrans: webhook notifikasi pembayaran — tanpa sesi,
// diamankan lewat verifikasi signature di route-nya sendiri.
// /daftar-sales, /daftar-gudang: registrasi sales/gudang via link undangan
// (diamankan token sekali-pakai di halamannya sendiri).
const PUBLIC_PATHS = [
  "/login",
  "/api/midtrans",
  "/daftar-sales",
  "/daftar-gudang",
];

// Sliding session: token berumur 30 hari, tapi tiap kali dipakai dan sudah
// lewat 7 hari sejak diterbitkan, diterbitkan ulang diam-diam — user yang
// masih aktif tidak akan pernah diminta login ulang; hanya yang nganggur
// > 30 hari yang sesinya kadaluarsa.
const SESSION_DAYS = 30;
const REFRESH_AFTER_S = 7 * 24 * 60 * 60;

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get("ugorex_session")?.value;
  let valid = false;
  let freshToken: string | null = null;
  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      valid = true;
      const ageS = Math.floor(Date.now() / 1000) - (payload.iat ?? 0);
      if (ageS > REFRESH_AFTER_S) {
        freshToken = await new SignJWT({
          userId: payload.userId,
          role: payload.role,
          name: payload.name,
        })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuedAt()
          .setExpirationTime(`${SESSION_DAYS}d`)
          .sign(SECRET);
      }
    } catch {
      valid = false;
    }
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  // Belum login & buka halaman privat -> ke /login
  if (!valid && !isPublic) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Catatan: user yang sudah login & membuka /login diarahkan ke landing
  // oleh halaman /login sendiri (cek DB), bukan di sini — supaya cookie basi
  // (JWT valid tapi user tak ada di DB) tidak menyebabkan loop redirect.

  const res = NextResponse.next();
  if (freshToken) {
    // Opsi cookie sama persis dengan createSession di lib/auth.ts
    res.cookies.set("ugorex_session", freshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production" && process.env.APP_URL?.startsWith("https://"),
      maxAge: 60 * 60 * 24 * SESSION_DAYS,
      path: "/",
    });
  }
  return res;
}

export const config = {
  // Lewati aset statis & api internal
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|manifest\\.webmanifest|.*\\.(?:png|webp|jpg|jpeg|svg|ico|geojson)$).*)",
  ],
};
