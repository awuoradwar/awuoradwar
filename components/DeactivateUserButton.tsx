"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { deactivateUserAction } from "@/app/actions/adminActions";
import { Language } from "@/lib/types";

export default function DeactivateUserButton({ id, lang }: { id: string; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await deactivateUserAction(id);
          router.refresh();
        })
      }
      className="tap-target rounded-full border border-critical px-3 text-xs font-semibold text-critical disabled:opacity-50"
    >
      {lang === "es" ? "Desactivar" : "Deactivate"}
    </button>
  );
}
