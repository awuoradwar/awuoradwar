"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { setLanguageAction } from "@/app/actions/auth";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

export default function LanguageToggle({ lang }: { lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const next: Language = lang === "en" ? "es" : "en";

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLanguageAction(next);
          router.refresh();
        })
      }
      className="tap-target rounded-lg border border-accent px-2 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
    >
      {t(lang, "language_toggle")}
    </button>
  );
}
