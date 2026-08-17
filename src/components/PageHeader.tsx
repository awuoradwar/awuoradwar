"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Language } from "@/lib/types";

/** Consistent back-chevron + title used at the top of every non-tab page,
 * replacing ~17 hand-rolled copies of the same "← Back" text link.
 *
 * Prefers router.back() so it lands wherever the user actually came from
 * (e.g. a task opened from Week goes back to Week, not always My Shift),
 * but only when NavDepthTracker's baseline shows we actually navigated
 * here from another in-app page -- a deep link or fresh tab has nothing
 * to go back to, so it falls back to the static backHref instead.
 */
export default function PageHeader({
  backHref,
  title,
  lang,
}: {
  backHref: string;
  title?: React.ReactNode;
  lang: Language;
}) {
  const router = useRouter();

  function handleBack(e: React.MouseEvent) {
    const baseline = Number(sessionStorage.getItem("appEntryHistoryLength") || 0);
    if (baseline && window.history.length > baseline) {
      e.preventDefault();
      router.back();
    }
  }

  return (
    <div className={title ? "mb-4" : "mb-3"}>
      <Link
        href={backHref}
        onClick={handleBack}
        className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-muted transition-colors hover:text-accent"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        {lang === "es" ? "Atrás" : "Back"}
      </Link>
      {title && <h1 className="text-lg font-semibold">{title}</h1>}
    </div>
  );
}
