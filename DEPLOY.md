# Deploy ke Vercel + Neon Postgres

Lokal pakai **SQLite**, produksi pakai **Postgres (Neon)**. Ikuti langkah ini saat siap deploy.

## 1. Buat database Neon (gratis)

1. Daftar di https://neon.tech → buat project baru.
2. Di halaman Connection, salin **2** connection string:
   - **Pooled** (ada `-pooler`) → untuk `DATABASE_URL`
   - **Direct** (tanpa `-pooler`) → untuk `DIRECT_URL`
   - Pastikan ada `?sslmode=require` di akhir.

## 2. Ganti Prisma ke Postgres

Di `prisma/schema.prisma`, ubah blok `datasource`:

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

> Catatan: setelah diganti, dev lokal juga butuh Postgres. Untuk tetap ngoprek lokal pakai SQLite, ganti baris ini cuma pas mau deploy (atau pakai branch khusus deploy).

## 3. Buat tabel + data awal di Neon

Set `.env` lokal sementara ke connection Neon, lalu:

```bash
npx prisma db push     # buat semua tabel di Neon
npm run db:seed        # isi admin/sales/owner + produk contoh (opsional)
```

Akun admin pertama dari seed: `0800000001 / password123` — **ganti password** setelah login, atau bikin admin manual.

## 4. Set Environment Variables di Vercel

Project Settings → Environment Variables (Production):

| Key | Value |
|-----|-------|
| `DATABASE_URL` | Neon **pooled** string (`...-pooler...?sslmode=require`) |
| `DIRECT_URL` | Neon **direct** string (`...?sslmode=require`) |
| `AUTH_SECRET` | string acak panjang (lihat di bawah) |

Generate AUTH_SECRET:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

## 5. Deploy

1. Push project ke GitHub.
2. Di Vercel → New Project → import repo → Deploy.
   - Build otomatis: `npm install` (jalanin `prisma generate` via postinstall) → `next build`.
3. Selesai. Buka domain Vercel → login admin.

## Catatan

- **Peta** (CARTO/OSM) & **GeoJSON** (`public/`) jalan tanpa setup tambahan.
- Kalau ubah schema nanti → jalankan lagi `npx prisma db push` ke Neon.
- Jangan commit `.env` (sudah di-ignore). Pakai `.env.example` sebagai acuan.
- File `public/logo.webp` & `karawang*.geojson` ikut ter-deploy otomatis.
