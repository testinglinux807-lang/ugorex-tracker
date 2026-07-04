"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { savePushSubscription } from "@/app/actions/push";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Kunci VAPID (base64url) -> Uint8Array untuk pushManager.subscribe
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "loading" | "off" | "on";

// Logo header: untuk admin/sales, klik = aktifkan notifikasi order di
// perangkat ini (tanpa tombol lonceng terpisah yang makan tempat di mobile).
// Titik lime kecil di pojok logo = notifikasi aktif.
export function LogoPush({ enablePush }: { enablePush: boolean }) {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    async function check(): Promise<Status> {
      if (
        !enablePush ||
        !VAPID_PUBLIC_KEY ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        Notification.permission === "denied"
      ) {
        return "unsupported";
      }
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      return sub ? "on" : "off";
    }
    check()
      .then(setStatus)
      .catch(() => setStatus("off"));
  }, [enablePush]);

  async function enable() {
    if (status !== "off") return;
    setStatus("loading");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setStatus("unsupported");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
      const json = sub.toJSON();
      const res = await savePushSubscription({
        endpoint: sub.endpoint,
        keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth },
      });
      setStatus(res?.ok ? "on" : "off");
    } catch (err) {
      console.error("Gagal mengaktifkan push:", err);
      setStatus("off");
    }
  }

  const logo = (
    <Image
      src="/logo.webp"
      alt="Ugorex"
      fill
      sizes="36px"
      className="object-cover object-top"
      priority
    />
  );

  // Owner / browser tak mendukung: logo biasa tanpa perilaku klik
  if (!enablePush || status === "unsupported") {
    return (
      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
        {logo}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={enable}
      title={
        status === "on"
          ? "Notifikasi order aktif di perangkat ini"
          : "Klik logo untuk mengaktifkan notifikasi order"
      }
      className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg"
    >
      {logo}
      {status === "on" && (
        <span className="absolute bottom-0.5 right-0.5 h-2 w-2 rounded-full border border-white bg-brand" />
      )}
    </button>
  );
}
