import Link from "next/link";
import { Language } from "@/lib/types";

/** Consistent back-chevron + title used at the top of every non-tab page,
 * replacing ~17 hand-rolled copies of the same "← Back" text link. */
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
