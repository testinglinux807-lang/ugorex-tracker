import "server-only";

// Integrasi Midtrans Core API (charge langsung per metode — bukan Snap).
// Instruksi pembayaran (nomor VA, QR, dll) dirender sendiri di UI kita,
// bukan redirect ke halaman Midtrans. Kunci diambil dari .env:
//  - MIDTRANS_SERVER_KEY            (server, rahasia)
//  - NEXT_PUBLIC_MIDTRANS_CLIENT_KEY (client, dipakai tokenisasi kartu)
//  - MIDTRANS_IS_PRODUCTION=true    (opsional; default sandbox)
// Kalau kunci belum diisi, checkout tetap jalan tanpa pembayaran online.

const API_BASE = () =>
  process.env.MIDTRANS_IS_PRODUCTION === "true"
    ? "https://api.midtrans.com"
    : "https://api.sandbox.midtrans.com";

export type ChargeItem = {
  id: string;
  price: number;
  quantity: number;
  name: string; // maks 50 karakter
};

export type ChargeCommon = {
  orderId: string;
  grossAmount: number;
  customerName: string;
  items: ChargeItem[];
};

export type CoreChargeResult = {
  transactionStatus: string;
  vaNumber?: string;
  vaBank?: string;
  qrUrl?: string; // URL gambar QR (QRIS/GoPay)
  deeplink?: string; // deeplink app GoPay (mobile)
  redirectUrl?: string; // halaman 3DS (kartu) — dibuka lewat popup MidtransNew3ds, bukan navigasi penuh
  expiryTime?: string;
};

type MidtransChargeResponse = {
  status_code?: string;
  status_message?: string;
  transaction_status?: string;
  va_numbers?: { bank: string; va_number: string }[];
  permata_va_number?: string;
  actions?: { name: string; method: string; url: string }[];
  redirect_url?: string;
  expiry_time?: string;
};

function parseChargeResponse(data: MidtransChargeResponse): CoreChargeResult {
  const va = data.va_numbers?.[0];
  const qrAction = data.actions?.find((a) => a.name === "generate-qr-code");
  const deeplinkAction = data.actions?.find(
    (a) => a.name === "deeplink-redirect",
  );
  return {
    transactionStatus: data.transaction_status ?? "pending",
    vaNumber: va?.va_number ?? data.permata_va_number ?? undefined,
    vaBank: va?.bank ?? (data.permata_va_number ? "permata" : undefined),
    qrUrl: qrAction?.url,
    deeplink: deeplinkAction?.url,
    redirectUrl: data.redirect_url,
    expiryTime: data.expiry_time,
  };
}

// POST /v2/charge — dipakai semua metode (bank_transfer/qris/gopay/credit_card).
// null kalau Midtrans belum dikonfigurasi / gagal / gross_amount 0 ditolak Midtrans.
async function coreCharge(
  payload: Record<string, unknown>,
): Promise<CoreChargeResult | null> {
  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return null;

  try {
    const res = await fetch(`${API_BASE()}/v2/charge`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization:
          "Basic " + Buffer.from(`${serverKey}:`).toString("base64"),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await res.json()) as MidtransChargeResponse;
    // Midtrans sering balas HTTP 200 meski gagal secara bisnis (mis. 402
    // "payment channel is not activated") — status_code di body-lah yang
    // menentukan sukses/gagal, bukan cuma HTTP status.
    const statusCode = Number(data.status_code);
    if (!res.ok || !(statusCode === 200 || statusCode === 201)) {
      console.error("Midtrans charge error:", res.status, data);
      return null;
    }
    return parseChargeResponse(data);
  } catch (err) {
    console.error("Midtrans unreachable:", err);
    return null;
  }
}

function commonPayload(params: ChargeCommon) {
  return {
    transaction_details: {
      order_id: params.orderId,
      gross_amount: params.grossAmount,
    },
    customer_details: { first_name: params.customerName.slice(0, 50) },
    item_details: params.items.map((i) => ({ ...i, name: i.name.slice(0, 50) })),
  };
}

export async function chargeVA(
  params: ChargeCommon & { bank: "bca" | "bni" | "bri" | "permata" },
): Promise<CoreChargeResult | null> {
  return coreCharge({
    payment_type: "bank_transfer",
    ...commonPayload(params),
    bank_transfer: { bank: params.bank },
  });
}

export async function chargeQris(
  params: ChargeCommon,
): Promise<CoreChargeResult | null> {
  return coreCharge({
    payment_type: "qris",
    ...commonPayload(params),
    qris: { acquirer: "gopay" },
  });
}

export async function chargeGopay(
  params: ChargeCommon,
): Promise<CoreChargeResult | null> {
  return coreCharge({
    payment_type: "gopay",
    ...commonPayload(params),
    gopay: { enable_callback: false },
  });
}

export async function chargeCard(
  params: ChargeCommon & { tokenId: string },
): Promise<CoreChargeResult | null> {
  return coreCharge({
    payment_type: "credit_card",
    ...commonPayload(params),
    credit_card: { token_id: params.tokenId, authentication: true },
  });
}

// Cek ke Midtrans apakah transaksi order ini sudah lunas — sumber
// kebenaran server-side, dipakai polling di halaman order (webhook tidak
// selalu sampai, mis. di localhost / sebelum notification URL diset).
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
