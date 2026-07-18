// Definisi tahap funnel (Awareness → Star Seller) dan nilai status.
// Nilai lama INTEREST/DESIRE/ACTION sudah dimigrasi ke skema ini
// (scripts/migrate-stages.mjs): INTEREST & DESIRE → CONSIDERATION,
// ACTION → CONVERSION.

export const STAGES = [
  "AWARENESS",
  "CONSIDERATION",
  "CONVERSION",
  "LOYALTY",
  "STAR_SELLER",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  AWARENESS: "Awareness",
  CONSIDERATION: "Consideration",
  CONVERSION: "Conversion",
  LOYALTY: "Loyalty",
  STAR_SELLER: "Star Seller",
};

export const STAGE_DESC: Record<Stage, string> = {
  AWARENESS: "Barang sudah ditawarkan / dikenalkan ke toko",
  CONSIDERATION: "Toko tertarik & mempertimbangkan ambil barang",
  CONVERSION: "Toko sudah order / mulai jualan barang",
  LOYALTY: "Toko repeat order & loyal",
  STAR_SELLER: "Konter andalan — penjualan tinggi & konsisten",
};

// Warna tiap tahap — gradien hijau (sehue brand lime), makin gelap = makin maju
export const STAGE_HEX: Record<Stage, string> = {
  AWARENESS: "#d2ec0a", // brand lime
  CONSIDERATION: "#9ad17f",
  CONVERSION: "#5cae4c",
  LOYALTY: "#2f8f2f",
  STAR_SELLER: "#1b5e20",
};

// Warna teks di atas warna tahap (kontras)
export const STAGE_ON: Record<Stage, string> = {
  AWARENESS: "#171717",
  CONSIDERATION: "#14401a",
  CONVERSION: "#0c2e0c",
  LOYALTY: "#ffffff",
  STAR_SELLER: "#ffffff",
};

export const RESULTS = ["REJECTED", "NEUTRAL", "POSITIVE"] as const;
export type Result = (typeof RESULTS)[number];

export const RESULT_LABEL: Record<Result, string> = {
  REJECTED: "Ditolak",
  NEUTRAL: "Netral",
  POSITIVE: "Positif / Tertarik",
};

// Hasil — monokrom: positif = solid hitam, ditolak = pudar
export const RESULT_COLOR: Record<Result, string> = {
  REJECTED: "bg-white text-neutral-400 border-neutral-300 line-through decoration-neutral-300",
  NEUTRAL: "bg-white text-neutral-600 border-neutral-300",
  POSITIVE: "bg-brand text-neutral-900 border-brand",
};

export const ROLES = ["ADMIN", "SALES", "OWNER"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: "Admin",
  SALES: "Sales",
  OWNER: "Owner Toko",
};

// Pencatatan keuangan (menu Keuangan, admin)
export const FINANCE_TYPES = ["INCOME", "EXPENSE"] as const;
export type FinanceType = (typeof FINANCE_TYPES)[number];

export const FINANCE_TYPE_LABEL: Record<FinanceType, string> = {
  INCOME: "Pemasukan",
  EXPENSE: "Pengeluaran",
};

// Saran kategori (dipakai sebagai datalist input; admin tetap bebas ketik).
// Kategori ini juga bahan laporan Laba Rugi/Neraca/Arus Kas di /keuangan —
// pemetaan kata kuncinya di lib/finance-statements.ts (mis. "Modal masuk"
// dihitung ekuitas, bukan pendapatan; "Beli barang"/"Ongkir" jadi HPP).
export const FINANCE_CATEGORIES: Record<FinanceType, string[]> = {
  INCOME: ["Profit orderan", "Penjualan POS", "Modal masuk", "Lainnya"],
  EXPENSE: [
    "Beli barang",
    "Ongkir / impor",
    "Iklan",
    "Admin bank",
    "Perlengkapan",
    "Biaya platform",
    "Gaji",
    "Sewa",
    "Operasional",
    "Pajak",
    "Lainnya",
  ],
};
