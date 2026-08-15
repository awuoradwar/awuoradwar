"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addIssueUpdateAction, resolveIssueAction, reopenIssueAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { textareaClass } from "./forms/FormShell";

export default function IssueDetailActions({ id, lang, status }: { id: string; lang: Language; status: string }) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [resolving, setResolving] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const isResolved = status === "RESOLVED";

  return (
    <div className="flex flex-col gap-3">
      {!isResolved && (
        <>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(lang, "detail_update_placeholder")}
            rows={2}
            className={textareaClass}
          />
          <div className="flex flex-wrap gap-2">
            <button
              disabled={pending || !note.trim()}
              onClick={() =>
                run(async () => {
                  await addIssueUpdateAction(id, note.trim());
                  setNote("");
                })
              }
              className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted disabled:opacity-50"
            >
              {t(lang, "action_add_update")}
            </button>
            {status !== "IN_PROGRESS" && (
              <button
                disabled={pending || !note.trim()}
                onClick={() =>
                  run(async () => {
                    await addIssueUpdateAction(id, note.trim(), "IN_PROGRESS");
                    setNote("");
                  })
                }
                className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted disabled:opacity-50"
              >
                {t(lang, "action_mark_in_progress")}
              </button>
            )}
            {status !== "WAITING" && (
              <button
                disabled={pending || !note.trim()}
                onClick={() =>
                  run(async () => {
                    await addIssueUpdateAction(id, note.trim(), "WAITING");
                    setNote("");
                  })
                }
                className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted disabled:opacity-50"
              >
                {t(lang, "action_mark_waiting")}
              </button>
            )}
          </div>

          {!resolving ? (
            <button
              type="button"
              onClick={() => setResolving(true)}
              className="tap-target self-start rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground"
            >
              {t(lang, "action_resolve")}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <textarea
                value={resolution}
                onChange={(e) => setResolution(e.target.value)}
                placeholder={t(lang, "detail_resolution_placeholder")}
                rows={2}
                className={textareaClass}
              />
              <button
                disabled={pending || !resolution.trim()}
                onClick={() =>
                  run(async () => {
                    await resolveIssueAction(id, resolution.trim());
                    setResolution("");
                    setResolving(false);
                  })
                }
                className="tap-target self-start rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50"
              >
                {t(lang, "action_resolve")}
              </button>
            </div>
          )}
        </>
      )}

      {isResolved && (
        <button
          disabled={pending}
          onClick={() => run(() => reopenIssueAction(id))}
          className="tap-target self-start rounded-full border border-critical px-4 text-sm font-semibold text-critical disabled:opacity-50"
        >
          {t(lang, "action_reopen")}
        </button>
      )}
    </div>
  );
}
