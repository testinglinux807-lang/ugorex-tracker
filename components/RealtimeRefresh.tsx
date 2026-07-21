"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Dengar event real-time (SSE) dan refresh data halaman otomatis
// (router.refresh() — re-fetch server component, BUKAN reload penuh, jadi
// scroll position & state client tidak hilang). Dipasang sekali di layout
// utama, berlaku untuk semua halaman & role — tiap halaman toh query sesuai
// role/izinnya sendiri, jadi aman broadcast satu sinyal ke semua orang.
export function RealtimeRefresh() {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    let es: EventSource | null = null;
    let retryTimer: ReturnType<typeof setTimeout>;

    function connect() {
      es = new EventSource("/api/realtime");
      es.onmessage = () => {
        // Throttle: maksimal 1x refresh per 2 detik — cegah thrashing kalau
        // banyak perubahan beruntun (mis. import massal / sweep otomatis).
        const now = Date.now();
        if (now - lastRefresh.current < 2000) return;
        lastRefresh.current = now;
        router.refresh();
      };
      es.onerror = () => {
        es?.close();
        retryTimer = setTimeout(connect, 3000);
      };
    }
    connect();

    return () => {
      es?.close();
      clearTimeout(retryTimer);
    };
  }, [router]);

  return null;
}
