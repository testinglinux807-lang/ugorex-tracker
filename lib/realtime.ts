import "server-only";
import { EventEmitter } from "node:events";

// Event bus in-memory (satu proses Node yang selalu nyala di VPS) — client
// subscribe lewat SSE (app/api/realtime/route.ts), server actions publish
// tiap ada perubahan data yang perlu terlihat tanpa refresh manual. Bukan
// pub/sub lintas-proses (butuh Redis dkk kalau nanti di-scale ke banyak
// instance) — cukup untuk satu server yang jalan sekarang.
const bus = new EventEmitter();
bus.setMaxListeners(0); // banyak client (tab/HP) boleh connect bersamaan

export type RealtimeEvent = { scope: string; at: number };

// `scope` cuma label buat debugging/log — client selalu refresh data
// halamannya sendiri (router.refresh()), jadi tidak perlu routing per-scope
// yang rumit; tiap halaman toh sudah query sesuai role & izinnya sendiri.
export function publishRealtime(scope: string) {
  bus.emit("change", { scope, at: Date.now() } satisfies RealtimeEvent);
}

export function subscribeRealtime(cb: (e: RealtimeEvent) => void) {
  bus.on("change", cb);
  return () => bus.off("change", cb);
}
