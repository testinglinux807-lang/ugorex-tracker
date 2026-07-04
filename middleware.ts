import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET ?? "ugorex-dev-secret",
);

// /api/midtrans: webhook notifikasi pembayaran — tanpa sesi,
// diamankan lewat verifikasi signature di route-nya sendiri.
const PUBLIC_PATHS = ["/login", "/api/midtrans"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const token = req.cookies.get("ugorex_session")?.value;
  let valid = false;
  if (token) {
    try {
      await jwtVerify(token, SECRET);
      valid = true;
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

  return NextResponse.next();
}

export const config = {
  // Lewati aset statis & api internal
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sw\\.js|.*\\.(?:png|webp|jpg|jpeg|svg|ico|geojson)$).*)",
  ],
};
