"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { syncOrderPayment } from "@/app/actions/requests";

// Pemantau pembayaran level halaman (owner). Masalahnya: setelah tap deeplink
// GoPay, app Gojek mengambil alih dan tab web sering di-unload HP; pas balik,
// panel instruksi (yang memegang polling) sudah ilang → status tak pernah
// update. Watcher ini tidak bergantung pada panel: begitu tab kembali aktif
// (balik dari Gojek) atau saat halaman remount, ia menyinkronkan semua order
// yang masih UNPAID ke Midtrans, lalu refresh kalau ada yang jadi lunas.
//
// Sengaja TANPA overlay loading: event visibilitychange/focus tak bisa
// membedakan "balik dari app bayar" vs "sekadar pindah tab browser lalu
// balik", jadi overlay full-screen akan berkedip di tiap pindah tab dan
// menutupi popup sukses. Feedback "sedang menunggu/lunas" cukup dari panel
// instruksi pembayaran; watcher ini cuma menyinkronkan status di belakang.
export function OrderPaymentWatcher({ pendingIds }: { pendingIds: string[] }) {
  const router = useRouter();
  const key = pendingIds.join(",");
  const busy = useRef(false);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (ids.length === 0) return;

    async function sync() {
      // Hanya jalan saat tab terlihat & tak ada sync lain berjalan — hindari
      // menembak Midtrans berkali saat tab di background.
      if (busy.current || document.visibilityState !== "visible") return;
      busy.current = true;
      try {
        let changed = false;
        for (const id of ids) {
          if (await syncOrderPayment(id)) changed = true;
        }
        // Refresh hanya kalau ada yang benar-benar jadi lunas — order lunas
        // keluar dari pendingIds, jadi tak ada loop refresh.
        if (changed) router.refresh();
      } finally {
        busy.current = false;
      }
    }

    const onVisible = () => {
      if (document.visibilityState === "visible") sync();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Sebagian browser HP hanya memicu "focus" (bukan visibilitychange)
    // saat kembali dari app lain.
    window.addEventListener("focus", onVisible);
    // Sync sekali saat mount — menangkap kasus halaman remount penuh setelah
    // balik dari Gojek (state panel sudah hilang).
    sync();

    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [key, router]);

  return null;
}
