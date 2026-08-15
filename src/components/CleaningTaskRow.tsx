"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { completeCleaningAction, completeCleaningWithPhotoAction, verifyCleaningAction, reopenCleaningAction } from "@/app/actions/cleaningActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";

interface CleaningTaskData {
  id: string;
  title: string;
  status: string;
  associate_name: string | null;
  photo_required: number;
  photo_url?: string | null;
}

export default function CleaningTaskRow({ task, lang }: { task: CleaningTaskData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [photoMode, setPhotoMode] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<{ error?: string } | void>) {
    startTransition(async () => {
      const result = await fn();
      if (result && "error" in result && result.error) {
        setError(result.error);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  const needsPhotoToComplete = task.status === "ASSIGNED" && !!task.photo_required;

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="text-xs text-muted">
            {task.associate_name || "—"}
            {task.photo_required ? ` · 📷 ${t(lang, "cleaning_photo_required")}` : ""}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge status={task.status} lang={lang} />
            {task.photo_url && (
              <a href={`/api/cleaning-photos/${task.id}`} target="_blank" rel="noreferrer" className="text-xs text-accent underline">
                {t(lang, "cleaning_view_photo")}
              </a>
            )}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          {task.status === "ASSIGNED" && !needsPhotoToComplete && (
            <button disabled={pending} onClick={() => run(() => completeCleaningAction(task.id))} className="tap-target rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50">
              {t(lang, "action_complete")}
            </button>
          )}
          {needsPhotoToComplete && !photoMode && (
            <button
              type="button"
              onClick={() => setPhotoMode(true)}
              className="tap-target rounded-full border-2 border-accent px-3 text-xs font-semibold text-accent"
            >
              {t(lang, "cleaning_add_photo")}
            </button>
          )}
          {task.status === "COMPLETED" && (
            <button disabled={pending} onClick={() => run(() => verifyCleaningAction(task.id))} className="tap-target rounded-full border-2 border-ok px-3 text-xs font-semibold text-ok disabled:opacity-50">
              {t(lang, "action_verify")}
            </button>
          )}
          {task.status === "VERIFIED" && (
            <button disabled={pending} onClick={() => run(() => reopenCleaningAction(task.id))} className="tap-target rounded-full border border-border px-3 text-xs text-muted disabled:opacity-50">
              {lang === "es" ? "Reabrir" : "Reopen"}
            </button>
          )}
        </div>
      </div>

      {needsPhotoToComplete && photoMode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            run(() => completeCleaningWithPhotoAction(fd));
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="taskId" value={task.id} />
          <input name="photo" type="file" accept="image/*" required capture="environment" className="flex-1 text-xs" />
          <button type="submit" disabled={pending} className="tap-target shrink-0 rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground disabled:opacity-50">
            {t(lang, "action_complete")}
          </button>
        </form>
      )}

      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
