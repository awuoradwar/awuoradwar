"use client";

import { useRef } from "react";

/** A <details>/<summary> toggle that scrolls its just-revealed content into
 * view when opened. Plain <details> leaves the viewport exactly where it
 * was on toggle -- fine for a short block, but when the summary sits low on
 * the page and the content below it is long (e.g. "Manage recurring
 * tasks"), opening it reveals nothing without a manual scroll since the
 * browser never moves the viewport on its own. */
export default function AutoScrollDetails({
  summary,
  className,
  summaryClassName,
  children,
}: {
  summary: React.ReactNode;
  className?: string;
  summaryClassName?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);

  return (
    <details
      ref={ref}
      className={className}
      onToggle={() => {
        if (!ref.current?.open) return;
        requestAnimationFrame(() => {
          const el = ref.current;
          if (!el) return;
          // Plain scrollIntoView({block: "start"}) tucks the target right
          // under the app's sticky top header, hiding the very summary the
          // user just tapped. Offset by the header's real height instead of
          // a hardcoded guess.
          const headerHeight = document.querySelector("header")?.getBoundingClientRect().height ?? 0;
          const top = el.getBoundingClientRect().top + window.scrollY - headerHeight - 8;
          window.scrollTo({ top, behavior: "smooth" });
        });
      }}
    >
      <summary className={summaryClassName ?? "cursor-pointer text-xs font-bold uppercase tracking-wide text-accent"}>{summary}</summary>
      {children}
    </details>
  );
}
