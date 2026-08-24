"use client";

import { useState, useTransition, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { newIdempotencyKey, enqueue, isOnline, QueueKind } from "@/lib/offlineQueue";

type ActionResult = { ok?: boolean; error?: string } | void;

export function useQuickAddSubmit(
  kind: QueueKind | null,
  action: (fd: FormData) => Promise<ActionResult>,
  labelFn: (fd: FormData) => string,
  redirectTo = "/my-shift"
) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "synced" | "queued">("idle");
  const router = useRouter();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const idempotencyKey = newIdempotencyKey();
    fd.set("idempotencyKey", idempotencyKey);
    setError(null);

    startTransition(async () => {
      if (kind && !isOnline()) {
        // Offline: record locally and stay put. Do NOT attempt a route
        // transition here -- a client-side navigation needs the network to
        // fetch the destination's RSC payload, and Next's fallback for a
        // failed one is a full `window.location` reload, which would show
        // the browser's own offline error page instead of our confirmation.
        enqueue({
          id: idempotencyKey,
          kind,
          label: labelFn(fd),
          fields: Object.fromEntries(fd.entries()) as Record<string, string>,
          createdAt: new Date().toISOString(),
        });
        setStatus("queued");
        return;
      }
      try {
        const result = await action(fd);
        if (result && "error" in result && result.error) {
          setError(result.error);
          return;
        }
        setStatus("synced");
        setTimeout(() => router.push(redirectTo), 500);
      } catch {
        if (kind) {
          // The request itself failed after being attempted (e.g. connection
          // dropped mid-submit) -- same reasoning as above, stay put.
          enqueue({
            id: idempotencyKey,
            kind,
            label: labelFn(fd),
            fields: Object.fromEntries(fd.entries()) as Record<string, string>,
            createdAt: new Date().toISOString(),
          });
          setStatus("queued");
        } else {
          setError("Something went wrong. Please try again.");
        }
      }
    });
  }

  return { onSubmit, pending, error, status };
}
