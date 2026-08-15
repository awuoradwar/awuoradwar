"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTemplateActiveAction } from "@/app/actions/templateActions";
import { Language } from "@/lib/types";

export default function TemplateToggle({ id, active, lang }: { id: string; active: boolean; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await toggleTemplateActiveAction(id, !active);
          router.refresh();
        })
      }
      className={`tap-target rounded-full px-3 text-xs font-semibold disabled:opacity-50 ${active ? "bg-ok/10 text-ok" : "bg-zinc-100 text-muted"}`}
    >
      {active ? (lang === "es" ? "Activa" : "Active") : lang === "es" ? "Inactiva" : "Off"}
    </button>
  );
}
