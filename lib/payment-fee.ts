// Biaya layanan per metode, mengikuti biaya Midtrans (midtrans.com/id/biaya):
//   VA (transfer bank) : Rp4.000 flat
//   QRIS               : 0,7%
//   DANA               : 1,5%
//   GoPay              : 2%
//   Kartu              : 2,9% + Rp2.000
//   Cash               : gratis (tidak lewat Midtrans)
// amount = total produk setelah diskon. Bagian persen dibulatkan ke atas ke
// kelipatan 100 supaya angkanya rapi dan pasti menutup potongan Midtrans.
const ceil100 = (n: number) => Math.ceil(n / 100) * 100;

export function paymentFee(method: string, amount: number): number {
  if (method === "CASH") return 0;
  if (method.startsWith("VA")) return 4000;
  if (method === "QRIS") return ceil100(amount * 0.007);
  if (method === "DANA") return ceil100(amount * 0.015);
  if (method === "GOPAY") return ceil100(amount * 0.02);
  if (method === "CARD") return ceil100(amount * 0.029) + 2000;
  return 0;
}

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
