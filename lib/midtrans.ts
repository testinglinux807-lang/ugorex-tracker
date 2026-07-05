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

// Core API (cek status transaksi) pakai host berbeda dari Snap
const API_BASE = () =>
  process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

export type SnapItem = {
  id: string;
  price: number;
  quantity: number;
  name: string; // maks 50 karakter
};

export type SnapTransaction = {
  token: string;
  redirectUrl: string; // halaman Snap full-page — dipakai di HP (popup iframe rewel di mobile)
};

// URL halaman Snap full-page untuk token yang sudah tersimpan.
// Format sama dengan redirect_url yang dikembalikan API Snap saat ini.
export function snapRedirectUrl(token: string) {
  return `${BASE()}/snap/v4/redirection/${token}`;
}

// Buat transaksi Snap; mengembalikan token popup + redirect URL, atau null
// kalau Midtrans belum dikonfigurasi / gagal. finishUrl (opsional) = tujuan
// balik setelah bayar lewat halaman redirect (popup pakai callback JS).
export async function createSnapTransaction(params: {
  orderId: string;
  grossAmount: number;
  customerName: string;
  items: SnapItem[];
  finishUrl?: string;
}): Promise<SnapTransaction | null> {
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
        ...(params.finishUrl
          ? { callbacks: { finish: params.finishUrl } }
          : {}),
      }),
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("Midtrans error:", res.status, await res.text());
      return null;
    }
    const data = (await res.json()) as {
      token?: string;
      redirect_url?: string;
    };
    if (!data.token) return null;
    return {
      token: data.token,
      redirectUrl: data.redirect_url ?? snapRedirectUrl(data.token),
    };
  } catch (err) {
    console.error("Midtrans unreachable:", err);
    return null;
  }
}

// Cek ke Midtrans apakah transaksi order ini sudah lunas.
// Sumber kebenaran server-side — dipakai callback Snap onSuccess
// (webhook tidak sampai ke localhost / sebelum notification URL diset).
export async function isTransactionPaid(orderId: string): Promise<boolean> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return false;

  try {
    const res = await fetch(`${API_BASE()}/v2/${orderId}/status`, {
      headers: {
        Accept: "application/json",
        Authorization:
          "Basic " + Buffer.from(`${serverKey}:`).toString("base64"),
      },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      transaction_status?: string;
      fraud_status?: string;
    };
    return (
      data.transaction_status === "settlement" ||
      (data.transaction_status === "capture" &&
        data.fraud_status === "accept")
    );
  } catch (err) {
    console.error("Midtrans status unreachable:", err);
    return false;
  }
}
