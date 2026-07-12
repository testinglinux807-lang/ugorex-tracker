// Definisi tahap funnel AIDA + Loyalty dan nilai status

export const STAGES = [
  "AWARENESS",
  "INTEREST",
  "DESIRE",
  "ACTION",
  "LOYALTY",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABEL: Record<Stage, string> = {
  AWARENESS: "Awareness",
  INTEREST: "Interest",
  DESIRE: "Desire",
  ACTION: "Action",
  LOYALTY: "Loyalty",
};

export const STAGE_DESC: Record<Stage, string> = {
  AWARENESS: "Barang sudah ditawarkan / dikenalkan ke toko",
  INTEREST: "Toko mulai tertarik & bertanya lebih lanjut",
  DESIRE: "Toko ingin / mempertimbangkan ambil barang",
  ACTION: "Toko sepakat / mulai jualan barang",
  LOYALTY: "Toko repeat order & loyal",
};

// Warna tiap tahap — gradien hijau (sehue brand lime), makin gelap = makin maju
export const STAGE_HEX: Record<Stage, string> = {
  AWARENESS: "#d2ec0a", // brand lime
  INTEREST: "#9ad17f",
  DESIRE: "#5cae4c",
  ACTION: "#2f8f2f",
  LOYALTY: "#1b5e20",
};

// Warna teks di atas warna tahap (kontras)
export const STAGE_ON: Record<Stage, string> = {
  AWARENESS: "#171717",
  INTEREST: "#14401a",
  DESIRE: "#0c2e0c",
  ACTION: "#ffffff",
  LOYALTY: "#ffffff",
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
