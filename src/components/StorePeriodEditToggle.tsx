"use client";

import { useState, ReactNode } from "react";
import StorePeriodForm, { StorePeriodDefaults } from "./StorePeriodForm";
import { Language } from "@/lib/types";

/** Swaps a period's read-only view for the (pre-filled) edit form -- shared
 * by the latest-period card and each history row, so a period created as a
 * label-only placeholder can have its numbers filled in later, or a typo'd
 * number fixed, without deleting and re-adding the whole period.
 *
 * `header` renders next to the Edit button in both states; `children` is
 * the read-only view, shown only while not editing. */
export default function StorePeriodEditToggle({
  lang,
  period,
  header,
  canEdit,
  children,
}: {
  lang: Language;
  period: StorePeriodDefaults;
  header: ReactNode;
  canEdit: boolean;
  children: ReactNode;
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <div>
        <div className="mb-2">{header}</div>
        <StorePeriodForm lang={lang} period={period} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div key="header" className="min-w-0 flex-1">
          {header}
        </div>
        {canEdit && (
          <button
            key="edit-button"
            type="button"
            onClick={() => setEditing(true)}
            className="tap-target flex shrink-0 items-center gap-1 rounded-full border border-accent px-3 text-sm font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            ✎ {lang === "es" ? "Editar" : "Edit"}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
