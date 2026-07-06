// Biaya layanan flat untuk pembayaran online (VA/QRIS/GoPay/Kartu).
// Cash tidak kena biaya ini sama sekali.
export const PAYMENT_FEE = 2500;

// Label metode pembayaran — dipakai di badge order, notifikasi, dan
// picker checkout supaya teksnya konsisten di semua tempat.
export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  VA_BCA: "Transfer BCA",
  VA_BNI: "Transfer BNI",
  VA_BRI: "Transfer BRI",
  VA_PERMATA: "Transfer Permata",
  QRIS: "QRIS",
  GOPAY: "GoPay",
  DANA: "DANA",
  CARD: "Kartu",
  CASH: "Cash",
};
