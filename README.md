# Ugorex Tracker

Dashboard untuk melacak posisi barang (mis. Antigores) di tiap konter/toko
melalui funnel **AIDA + Loyalty**: Awareness → Interest → Desire → Action → Loyalty.

## Stack
- Next.js 16 (App Router) + React 19
- Prisma 6 + SQLite
- Tailwind CSS 4
- Auth: JWT di cookie httpOnly (jose) + bcrypt

## Role
- **Admin** — kelola semua barang, konter, akun sales; lihat semua laporan.
- **Sales** — keliling ke konter, input update funnel, buatkan akun owner saat setuju.
- **Owner Toko** — akun dibuat sales, lihat data tokonya (read-only).

## Menjalankan (development)
```bash
npm install
npm run db:push     # buat skema database
npm run db:seed     # isi data contoh
npm run dev         # http://localhost:3000
```

### Akun demo (setelah seed)
| Role  | No HP (login) | Password    |
|-------|---------------|-------------|
| Admin | 0800000001    | password123 |
| Sales | 0811111111    | password123 |

## Perintah berguna
- `npm run db:studio` — buka Prisma Studio (lihat/edit DB lewat browser)
- `npm run build && npm start` — build & jalankan versi produksi

## Struktur data
- **User** (role: ADMIN/SALES/OWNER)
- **Store** (konter/toko) — nama, area, owner, sales penanggung jawab
- **Product** (barang)
- **Prospect** — 1 barang di 1 konter + tahap funnel saat ini
- **StageLog** — riwayat tiap update: tahap, hasil (Ditolak/Netral/Positif), catatan, jumlah, sales, tanggal

## Catatan produksi
- Ganti `AUTH_SECRET` di `.env` dengan string acak yang panjang.
- SQLite cocok untuk skala kecil. Untuk multi-user besar/online, pertimbangkan PostgreSQL
  (tinggal ubah `provider` & `DATABASE_URL` di `prisma/schema.prisma`).
