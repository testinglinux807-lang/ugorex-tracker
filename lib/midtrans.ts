import "server-only";

// Integrasi Midtrans Snap. Kunci diambil dari .env:
//  - MIDTRANS_SERVER_KEY            (server, rahasia)
//  - NEXT_PUBLIC_MIDTRANS_CLIENT_KEY (client, untuk snap.js)
//  - MIDTRANS_IS_PRODUCTION=true    (opsional; default sandbox)
// Kalau kunci belum diisi, checkout tetap jalan tanpa pembayaran online.

const BASE = () =>
  process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://app.midtrans.com"
    : "https://app.sandbox.midtrans.com";

export type SnapItem = {
  id: string;
  price: number;
  quantity: number;
  name: string; // maks 50 karakter
};

// Buat transaksi Snap; mengembalikan token popup, atau null kalau
// Midtrans belum dikonfigurasi / gagal.
export async function createSnapTransaction(params: {
  orderId: string;
  grossAmount: number;
  customerName: string;
  items: SnapItem[];
}): Promise<string | null> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return null;

  try {
    const res = await fetch(`${BASE()}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization:
          "Basic " + Buffer.from(`${serverKey}:`).toString("base64"),
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: params.orderId,
          gross_amount: params.grossAmount,
        },
        item_details: params.items.map((i) => ({
          ...i,
          name: i.name.slice(0, 50),
        })),
        customer_details: { first_name: params.customerName.slice(0, 50) },
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Midtrans error:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch (err) {
    console.error("Midtrans unreachable:", err);
    return null;
  }
}
