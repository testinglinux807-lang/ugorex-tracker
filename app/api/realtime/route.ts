import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { subscribeRealtime } from "@/lib/realtime";

// SSE (Server-Sent Events) — koneksi tetap kebuka, server dorong event tiap
// ada perubahan data (lihat lib/realtime.ts). Butuh proses Node yang selalu
// nyala (bukan serverless) — sesuai hosting VPS. Tanpa parsing body/isi
// event yang berat: client cukup tahu "ada perubahan" lalu router.refresh().
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const encoder = new TextEncoder();
  let unsubscribe: () => void = () => {};
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream({
    start(controller) {
      const send = (line: string) => {
        try {
          controller.enqueue(encoder.encode(line));
        } catch {
          // Controller sudah ditutup (client putus) — abaikan.
        }
      };

      send(`retry: 3000\n\n`);
      unsubscribe = subscribeRealtime((e) => {
        send(`data: ${JSON.stringify(e)}\n\n`);
      });
      // Heartbeat — cegah koneksi dianggap idle & diputus proxy/load balancer.
      heartbeat = setInterval(() => send(`: ping\n\n`), 25000);
    },
    cancel() {
      clearInterval(heartbeat);
      unsubscribe();
    },
  });

  req.signal.addEventListener("abort", () => {
    clearInterval(heartbeat);
    unsubscribe();
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
