"use client";

import { useOptimistic, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTemplateActiveAction } from "@/app/actions/templateActions";
import { Language } from "@/lib/types";
import { usePreservedScroll } from "@/lib/usePreservedScroll";

export default function TemplateToggle({ id, active, lang }: { id: string; active: boolean; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [displayActive, setOptimisticActive] = useOptimistic(active, (_state, next: boolean) => next);
  const router = useRouter();
  const { capture, restore } = usePreservedScroll();

  return (
    <button
      disabled={pending}
      onClick={() => {
        capture();
        startTransition(async () => {
          setOptimisticActive(!displayActive);
          await toggleTemplateActiveAction(id, !displayActive);
          router.refresh();
          restore();
        });
      }}
      className={`h-9 min-h-0 inline-flex items-center justify-center rounded-full px-3 text-xs font-semibold disabled:opacity-50 ${displayActive ? "bg-ok/10 text-ok" : "bg-muted/10 text-muted"}`}
    >
      {displayActive ? (lang === "es" ? "Activa" : "Active") : lang === "es" ? "Inactiva" : "Off"}
    </button>
  );
}
