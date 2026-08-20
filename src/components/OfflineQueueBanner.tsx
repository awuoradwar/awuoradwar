"use client";

import { useCallback, useEffect, useState } from "react";
import { getQueue, dequeue, QueuedItem, isOnline } from "@/lib/offlineQueue";
import {
  quickAddTaskAction,
  quickAddCallInAction,
  quickAddLateAction,
  quickAddMealReplacementAction,
  quickAddBorrowedItemAction,
  quickAddIssueAction,
  quickAddCateringAction,
} from "@/app/actions/quickAddActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const DISPATCH: Record<QueuedItem["kind"], (fd: FormData) => Promise<unknown>> = {
  task: quickAddTaskAction,
  callIn: quickAddCallInAction,
  late: quickAddLateAction,
  guestRecovery: quickAddMealReplacementAction,
  borrowedItem: quickAddBorrowedItemAction,
  issue: quickAddIssueAction,
  catering: quickAddCateringAction,
};

export default function OfflineQueueBanner({ lang }: { lang: Language }) {
  // Start from the SSR-safe defaults (empty queue, assume online) so the
  // server-rendered markup matches the client's first render exactly; the
  // real values are read a moment later inside the effect below.
  const [queue, setQueue] = useState<QueuedItem[]>([]);
  const [online, setOnline] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(() => setQueue(getQueue()), []);

  const flush = useCallback(async () => {
    if (!isOnline()) return;
    setSyncing(true);
    for (const item of getQueue()) {
      try {
        const fd = new FormData();
        for (const [k, v] of Object.entries(item.fields)) fd.set(k, v);
        fd.set("idempotencyKey", item.id);
        await DISPATCH[item.kind](fd);
        dequeue(item.id);
      } catch {
        // stays queued; will retry on next flush
      }
    }
    setSyncing(false);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onOnline = () => {
      setOnline(true);
      flush();
    };
    const onOffline = () => setOnline(false);
    const onChange = () => refresh();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("shiftops-queue-changed", onChange);
    const initialSync = setTimeout(() => {
      setOnline(isOnline());
      refresh();
      if (isOnline()) flush();
    }, 0);
    return () => {
      clearTimeout(initialSync);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("shiftops-queue-changed", onChange);
    };
  }, [flush, refresh]);

  if (online && queue.length === 0) return null;

  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-warning/90 px-4 py-2 text-xs font-medium text-white">
      <span>
        {!online
          ? lang === "es"
            ? "Sin conexión — los cambios se guardarán localmente"
            : "Offline — changes will be saved on this device"
          : `${queue.length} ${t(lang, "offline_queued")}`}
      </span>
      {online && queue.length > 0 && (
        <button
          type="button"
          onClick={flush}
          disabled={syncing}
          className="tap-target flex items-center justify-center rounded bg-white/20 px-3"
        >
          {syncing ? "…" : t(lang, "offline_retry")}
        </button>
      )}
    </div>
  );
}
