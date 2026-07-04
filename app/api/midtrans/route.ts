import crypto from "node:crypto";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { notifyOrder } from "@/lib/wa-notify";

// Webhook notifikasi pembayaran Midtrans.
// Set URL ini di Midtrans Dashboard -> Settings -> Payment Notification URL:
//   https://<domain>/api/midtrans
export async function POST(req: Request) {
  const body = (await req.json()) as {
    order_id?: string;
    status_code?: string;
    gross_amount?: string;
    signature_key?: string;
    transaction_status?: string;
    fraud_status?: string;
  };

  const serverKey = process.env.MIDTRANS_SERVER_KEY;
  if (!serverKey) return new Response("midtrans not configured", { status: 503 });
  const expected = crypto
    .createHash("sha512")
    .update(
      `${body.order_id}${body.status_code}${body.gross_amount}${serverKey}`,
    )
    .digest("hex");
  if (!body.signature_key || body.signature_key !== expected) {
    return new Response("invalid signature", { status: 403 });
  }

  const status = body.transaction_status;
  const paid =
    status === "settlement" ||
    (status === "capture" && body.fraud_status === "accept");

  if (body.order_id && paid) {
    const orderId = body.order_id;
    // updateMany: idempoten — Midtrans bisa mengirim notifikasi berulang,
    // WA hanya dikirim saat transisi pertama ke PAID.
    const res = await prisma.request.updateMany({
      where: { id: orderId, paymentStatus: { not: "PAID" } },
      data: { paymentStatus: "PAID" },
    });
    if (res.count > 0) {
      after(() => notifyOrder(orderId, "paid"));
      revalidatePath("/order");
      revalidatePath("/request");
    }
  }

  return Response.json({ ok: true });
}
