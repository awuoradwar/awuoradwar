"use client";

import { useEffect, useState } from "react";
import { getVapidPublicKeyAction, subscribeToPushAction, unsubscribeFromPushAction } from "@/app/actions/pushActions";
import { Language } from "@/lib/types";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

type Status = "unsupported" | "denied" | "off" | "on" | "busy";

function initialStatus(): Status {
  if (typeof window === "undefined") return "busy";
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "busy";
}

export default function PushNotificationToggle({ lang }: { lang: Language }) {
  const [status, setStatus] = useState<Status>(initialStatus);

  // Mount-only: resolve whether a subscription already exists. Guarded so it
  // only runs when the lazy initial state left us in "busy" (i.e. push is
  // actually supported and not blocked) -- setState only ever happens inside
  // the async .then(), never synchronously in the effect body.
  useEffect(() => {
    if (initialStatus() !== "busy") return;
    navigator.serviceWorker.ready.then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      setStatus(sub ? "on" : "off");
    });
  }, []);

  async function enable() {
    setStatus("busy");
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const publicKey = await getVapidPublicKeyAction();
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      await subscribeToPushAction(sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } });
      setStatus("on");
    } catch {
      setStatus("off");
    }
  }

  async function disable() {
    setStatus("busy");
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await unsubscribeFromPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setStatus("off");
    } catch {
      setStatus("on");
    }
  }

  if (status === "unsupported") return null;

  const label = {
    denied: lang === "es" ? "Bloqueadas en el navegador" : "Blocked in browser settings",
    off: lang === "es" ? "Desactivadas" : "Off",
    on: lang === "es" ? "Activadas" : "On",
    busy: "…",
  }[status];

  return (
    <section className="mb-4 flex items-center justify-between card p-4">
      <div className="min-w-0 pr-3">
        <p className="text-sm font-medium">{lang === "es" ? "Notificaciones push" : "Push notifications"}</p>
        <p className="text-xs text-muted">
          {lang === "es"
            ? "Avisos de trabajo crítico y entregas nuevas, aunque la app esté cerrada."
            : "Alerts for critical work and new handoffs, even with the app closed."}
        </p>
        <p className="mt-1 text-xs font-medium text-muted">{label}</p>
      </div>
      {status === "denied" ? null : (
        <button
          type="button"
          disabled={status === "busy"}
          onClick={status === "on" ? disable : enable}
          className={`tap-target shrink-0 rounded-xl px-4 text-xs font-semibold transition-colors disabled:opacity-50 ${
            status === "on" ? "border border-border text-muted hover:border-critical hover:text-critical" : "bg-accent text-accent-foreground hover:bg-accent-hover"
          }`}
        >
          {status === "on" ? (lang === "es" ? "Desactivar" : "Turn off") : lang === "es" ? "Activar" : "Turn on"}
        </button>
      )}
    </section>
  );
}
