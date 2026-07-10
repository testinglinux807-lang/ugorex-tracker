import { PrismaClient } from "@prisma/client";

// Singleton agar tidak membuat banyak koneksi saat hot-reload dev
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    // Kolom foto berisi data URI base64 (bisa ratusan KB per baris). Tanpa
    // omit ini, SETIAP findMany/include yang menyentuh Product/Request ikut
    // menyeret base64-nya dari Neon — inilah yang menghabiskan kuota data
    // transfer. Foto hanya boleh diambil eksplisit (select) oleh route
    // /api/product-image dan /api/delivery-photo.
    omit: {
      product: { imageUrl: true },
      request: { deliveryPhoto: true },
    },
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
