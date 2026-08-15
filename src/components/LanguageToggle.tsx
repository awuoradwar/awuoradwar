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
      className="tap-target rounded-lg border border-border px-2 text-xs font-medium text-accent disabled:opacity-50"
    >
      {t(lang, "language_toggle")}
    </button>
  );
}
