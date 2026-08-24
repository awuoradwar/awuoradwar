import Link from "next/link";
import { Language } from "@/lib/types";

/** Consistent back-chevron + title used at the top of every non-tab page,
 * replacing ~17 hand-rolled copies of the same "← Back" text link.
 *
 * Always the plain, static backHref -- this used to prefer router.back()
 * (via a sessionStorage/history-length heuristic in NavDepthTracker) so it
 * could land wherever the user actually came from, but that heuristic goes
 * wrong exactly in the situations most likely to burn a manager on a
 * phone: the OS reclaiming a backgrounded PWA's memory and reloading it,
 * a stale session-storage baseline after that reload, a deep link. Every
 * backHref passed in throughout the app is already a deliberately-chosen
 * sensible destination for that page, so a plain, always-reliable Link
 * beats a "smarter" back that can silently go nowhere.
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
  return (
    <div className={title ? "mb-4" : "mb-3"}>
      <Link
        href={backHref}
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
