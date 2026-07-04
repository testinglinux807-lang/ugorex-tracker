"use client";

import { useEffect, useState } from "react";
import {
  savePushSubscription,
  removePushSubscription,
} from "@/app/actions/push";
import { Spinner } from "@/components/SubmitButton";
import { Bell, BellOff } from "lucide-react";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

// Kunci VAPID (base64url) -> Uint8Array untuk pushManager.subscribe
function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "loading" | "off" | "on";

// Tombol lonceng: aktif/nonaktifkan notifikasi browser di perangkat ini
export function PushToggle() {
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    async function check(): Promise<Status> {
      if (
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
  }, []);

  async function enable() {
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

  async function disable() {
    setStatus("loading");
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
    } finally {
      setStatus("off");
    }
  }

  if (status === "unsupported") return null;

  return (
    <button
      type="button"
      onClick={status === "on" ? disable : enable}
      disabled={status === "loading"}
      title={
        status === "on"
          ? "Notifikasi order aktif di perangkat ini — klik untuk mematikan"
          : "Aktifkan notifikasi order di perangkat ini"
      }
      className={`flex h-8 w-8 items-center justify-center rounded-lg border ${
        status === "on"
          ? "border-neutral-900 bg-neutral-900 text-white"
          : "border-neutral-200 text-neutral-500 hover:bg-neutral-100"
      }`}
    >
      {status === "loading" ? (
        <Spinner className="h-3.5 w-3.5" />
      ) : status === "on" ? (
        <Bell className="h-4 w-4" />
      ) : (
        <BellOff className="h-4 w-4" />
      )}
    </button>
  );
}
