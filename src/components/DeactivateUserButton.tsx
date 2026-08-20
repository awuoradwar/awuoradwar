"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivateUserAction, reactivateUserAction } from "@/app/actions/adminActions";
import { Language } from "@/lib/types";

export default function DeactivateUserButton({ id, active, lang }: { id: string; active: boolean; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [displayActive, setOptimisticActive] = useOptimistic(active, (_state, next: boolean) => next);
  const router = useRouter();

  function run(action: (id: string) => Promise<void>, next: boolean) {
    startTransition(async () => {
      setOptimisticActive(next);
      await action(id);
      router.refresh();
    });
  }

  if (!displayActive) {
    return (
      <button
        disabled={pending}
        onClick={() => run(reactivateUserAction, true)}
        className="h-9 min-h-0 inline-flex items-center justify-center rounded-full border border-ok px-3 text-xs font-semibold text-ok disabled:opacity-50"
      >
        {lang === "es" ? "Reactivar" : "Reactivate"}
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => run(deactivateUserAction, false)}
      className="h-9 min-h-0 inline-flex items-center justify-center rounded-full border border-critical px-3 text-xs font-semibold text-critical disabled:opacity-50"
    >
      {lang === "es" ? "Desactivar" : "Deactivate"}
    </button>
  );
}
