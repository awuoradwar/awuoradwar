"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivateUserAction, reactivateUserAction } from "@/app/actions/adminActions";
import { Language } from "@/lib/types";

export default function DeactivateUserButton({ id, active, lang }: { id: string; active: boolean; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: (id: string) => Promise<void>) {
    startTransition(async () => {
      await action(id);
      router.refresh();
    });
  }

  if (!active) {
    return (
      <button
        disabled={pending}
        onClick={() => run(reactivateUserAction)}
        className="tap-target rounded-full border border-ok px-3 text-xs font-semibold text-ok disabled:opacity-50"
      >
        {lang === "es" ? "Reactivar" : "Reactivate"}
      </button>
    );
  }

  return (
    <button
      disabled={pending}
      onClick={() => run(deactivateUserAction)}
      className="tap-target rounded-full border border-critical px-3 text-xs font-semibold text-critical disabled:opacity-50"
    >
      {lang === "es" ? "Desactivar" : "Deactivate"}
    </button>
  );
}
