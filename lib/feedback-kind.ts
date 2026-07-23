// Kategori feedback yang dipakai di seluruh app (owner → sales/admin, sales
// atas nama konter, dan sales → admin) supaya istilahnya seragam.
export const FEEDBACK_KIND = {
  KELUHAN: "Keluhan",
  SARAN: "Saran",
  BARANG: "Ajukan barang",
} as const;

export type FeedbackKind = keyof typeof FEEDBACK_KIND;

export function isFeedbackKind(v: string): v is FeedbackKind {
  return v in FEEDBACK_KIND;
}

// Warna badge per kategori — monokrom + aksen lime, sama seperti riwayat
// feedback owner.
export const FEEDBACK_KIND_CLS: Record<FeedbackKind, string> = {
  KELUHAN: "border-red-200 bg-red-50 text-red-600",
  SARAN: "border-neutral-300 bg-neutral-100 text-neutral-600",
  BARANG: "border-brand-dark bg-brand/20 text-neutral-900",
};
