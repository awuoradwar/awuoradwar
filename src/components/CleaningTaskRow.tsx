"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeCleaningAction,
  uploadCleaningPhotoAction,
  verifyCleaningAction,
  reopenCleaningAction,
  setCleaningTaskAssociateAction,
} from "@/app/actions/cleaningActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";

interface CleaningTaskData {
  id: string;
  title: string;
  title_es?: string | null;
  description?: string | null;
  description_es?: string | null;
  weekday?: number | null;
  status: string;
  associate_name: string | null;
  photo_required: number;
  photo_before_url?: string | null;
  photo_after_url?: string | null;
}

const WEEKDAY_LABEL: Record<number, { en: string; es: string }> = {
  0: { en: "Sunday", es: "Domingo" },
  1: { en: "Monday", es: "Lunes" },
  2: { en: "Tuesday", es: "Martes" },
  3: { en: "Wednesday", es: "Miércoles" },
  4: { en: "Thursday", es: "Jueves" },
  5: { en: "Friday", es: "Viernes" },
  6: { en: "Saturday", es: "Sábado" },
};

/** One before/after slot: an "Add" button when empty, View/Download links once a photo exists. */
function PhotoSlot({ taskId, kind, url, lang }: { taskId: string; kind: "before" | "after"; url: string | null | undefined; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const label = kind === "before" ? t(lang, "cleaning_before_photo") : t(lang, "cleaning_after_photo");

  if (url) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs">
        <span className="font-medium text-muted">{label}:</span>
        <a href={`/api/cleaning-photos/${taskId}?kind=${kind}`} target="_blank" rel="noreferrer" className="text-accent underline">
          {t(lang, "cleaning_view")}
        </a>
        <a href={`/api/cleaning-photos/${taskId}?kind=${kind}&download=1`} className="text-accent underline">
          {t(lang, "cleaning_download")}
        </a>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="tap-target h-7 min-h-0 rounded-full border border-dashed border-border px-2.5 text-[11px] font-semibold text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        📷 {t(lang, "cleaning_add")} {label}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const fd = new FormData();
          fd.set("taskId", taskId);
          fd.set("kind", kind);
          fd.set("photo", file);
          startTransition(async () => {
            await uploadCleaningPhotoAction(fd);
            router.refresh();
          });
        }}
      />
    </span>
  );
}

/** Tap the associate name (or "Assign associate") to set who's actually
 * doing this task -- the manager on duty's main job here, separate from
 * which manager owns the area overall. */
function AssociateEditor({ taskId, associateName, lang }: { taskId: string; associateName: string | null; lang: Language }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(associateName || "");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            await setCleaningTaskAssociateAction(taskId, value);
            setEditing(false);
            router.refresh();
          });
        }}
        className="inline-flex items-center gap-1"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={lang === "es" ? "Nombre" : "Name"}
          autoFocus
          className="h-6 w-24 rounded-md border border-accent bg-card px-1.5 text-xs outline-none"
        />
        <button type="submit" disabled={pending} className="text-xs font-semibold text-accent">
          ✓
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-xs font-medium text-accent underline decoration-dotted"
    >
      {associateName || (lang === "es" ? "Asignar asociado" : "Assign associate")}
    </button>
  );
}

export default function CleaningTaskRow({ task, lang }: { task: CleaningTaskData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
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

  const needsAfterPhotoToComplete = task.status === "ASSIGNED" && !!task.photo_required && !task.photo_after_url;
  const title = lang === "es" && task.title_es ? task.title_es : task.title;
  const description = lang === "es" && task.description_es ? task.description_es : task.description;
  const dueDay = task.weekday != null ? WEEKDAY_LABEL[task.weekday]?.[lang] : null;

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <div className="flex flex-wrap items-center gap-x-1 text-xs text-muted">
            {dueDay && <span>{lang === "es" ? "Vence" : "Due"}: {dueDay} ·</span>}
            <AssociateEditor taskId={task.id} associateName={task.associate_name} lang={lang} />
            {task.photo_required ? <span>· 📷 {t(lang, "cleaning_photo_required")}</span> : null}
          </div>
          {description && (
            <details className="mt-1">
              <summary className="cursor-pointer text-xs text-accent">{lang === "es" ? "Ver detalle" : "View checklist"}</summary>
              <p className="mt-1 text-xs text-muted">{description}</p>
            </details>
          )}
          <div className="mt-1">
            <StatusBadge status={task.status} lang={lang} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {task.status === "ASSIGNED" &&
            (needsAfterPhotoToComplete ? (
              <span className="text-[11px] font-medium text-warning">{lang === "es" ? "Falta foto de después" : "Needs after photo"}</span>
            ) : (
              <button disabled={pending} onClick={() => run(() => completeCleaningAction(task.id))} className="tap-target rounded-full bg-accent px-3 text-xs font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50">
                {t(lang, "action_complete")}
              </button>
            ))}
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

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <PhotoSlot taskId={task.id} kind="before" url={task.photo_before_url} lang={lang} />
        <PhotoSlot taskId={task.id} kind="after" url={task.photo_after_url} lang={lang} />
      </div>

      {error && <p className="text-xs text-critical">{error}</p>}
    </div>
  );
}
