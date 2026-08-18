"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  completeCleaningAction,
  uploadCleaningPhotoAction,
  verifyCleaningAction,
  reopenCleaningAction,
  setCleaningTaskAssociateAction,
  deleteCleaningTaskAction,
  updateCleaningTaskAction,
  setChecklistItemAssociateAction,
  toggleChecklistItemDoneAction,
} from "@/app/actions/cleaningActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import StatusBadge from "./StatusBadge";
import { Field, inputClass, selectClass } from "./forms/FormShell";

interface ChecklistItemData {
  id: string;
  text: string;
  associate_name: string | null;
  done: number;
}

interface CleaningTaskData {
  id: string;
  title: string;
  title_es?: string | null;
  description?: string | null;
  description_es?: string | null;
  weekday?: number | null;
  frequency?: "DAILY" | "WEEKLY";
  status: string;
  associate_name: string | null;
  photo_required: number;
  photo_before_url?: string | null;
  photo_after_url?: string | null;
  checklistItems?: ChecklistItemData[];
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
      <span className="inline-flex items-center gap-1.5 text-sm">
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
    <span className="inline-flex items-center gap-1 text-sm">
      <button
        type="button"
        disabled={pending}
        onClick={() => inputRef.current?.click()}
        className="tap-target h-8 min-h-0 rounded-full border border-dashed border-border px-2.5 text-xs font-semibold text-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      >
        📷 {t(lang, "cleaning_add")} {label}
      </button>
      {/* No `capture` attribute -- lets mobile browsers offer both "Take Photo"
          and "Choose from Library" instead of forcing straight to the camera. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
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
          className="h-8 w-28 rounded-md border border-accent bg-card px-2 text-sm outline-none"
        />
        <button type="submit" disabled={pending} className="text-sm font-semibold text-accent">
          ✓
        </button>
      </form>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-sm font-medium text-accent underline decoration-dotted"
    >
      {associateName || (lang === "es" ? "Asignar asociado" : "Assign associate")}
    </button>
  );
}

/** Same tap-to-edit pattern as AssociateEditor, scoped to one checklist
 * sub-item instead of the whole task -- lets different associates be
 * assigned to different parts of the same cleaning job (e.g. one person on
 * the hoods, another on the drains, within the same "Deep clean cook
 * range" task). */
function ChecklistItemAssociateEditor({ itemId, associateName, lang }: { itemId: string; associateName: string | null; lang: Language }) {
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
            await setChecklistItemAssociateAction(itemId, value);
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
          className="h-7 w-24 rounded-md border border-accent bg-card px-2 text-xs outline-none"
        />
        <button type="submit" disabled={pending} className="text-xs font-semibold text-accent">
          ✓
        </button>
      </form>
    );
  }

  return (
    <button type="button" onClick={() => setEditing(true)} className="text-xs font-medium text-accent underline decoration-dotted">
      {associateName || (lang === "es" ? "Asignar" : "Assign")}
    </button>
  );
}

/** One line of a task's checklist -- its own done/not-done state and its
 * own associate, independent of the task's overall Complete button. */
function ChecklistItemRow({ item, lang }: { item: ChecklistItemData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 py-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await toggleChecklistItemDoneAction(item.id, !item.done);
            router.refresh();
          })
        }
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 text-xs font-bold disabled:opacity-50 ${
          item.done ? "border-ok bg-ok text-white" : "border-border text-transparent"
        }`}
      >
        ✓
      </button>
      <span className={`flex-1 text-sm ${item.done ? "text-muted line-through" : ""}`}>{item.text}</span>
      <ChecklistItemAssociateEditor itemId={item.id} associateName={item.associate_name} lang={lang} />
    </div>
  );
}

/** Full edit of the task itself -- title, checklist description, day/frequency,
 * and whether an after photo is required -- same fields as the add form, so
 * anything typed in wrong (or that the company chart changes) can be fixed
 * in place instead of deleting and re-adding. */
function EditTaskForm({ task, lang, onDone }: { task: CleaningTaskData; lang: Language; onDone: () => void }) {
  const [frequency, setFrequency] = useState<"DAILY" | "WEEKLY">(task.frequency || "DAILY");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const weekdayLabels = lang === "es"
    ? ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"]
    : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateCleaningTaskAction(fd);
          if (result && "error" in result && result.error) {
            setError(result.error);
            return;
          }
          setError(null);
          onDone();
          router.refresh();
        });
      }}
      className="flex flex-col gap-2 border-t border-border pt-2"
    >
      <input type="hidden" name="id" value={task.id} />
      <Field label={lang === "es" ? "Tarea" : "Task"}>
        <input name="title" defaultValue={task.title} required className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Detalle de la lista de verificación (opcional)" : "Checklist details (optional)"}>
        <textarea name="description" defaultValue={task.description || ""} rows={3} className={inputClass} />
      </Field>
      <Field label={lang === "es" ? "Frecuencia (se repite)" : "Frequency (recurring)"}>
        <select name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value as "DAILY" | "WEEKLY")} className={selectClass}>
          <option value="DAILY">{lang === "es" ? "Diaria" : "Daily"}</option>
          <option value="WEEKLY">{lang === "es" ? "Semanal" : "Weekly"}</option>
        </select>
      </Field>
      {frequency === "WEEKLY" && (
        <Field label={lang === "es" ? "Día" : "Day"}>
          <select name="weekday" defaultValue={task.weekday ?? ""} className={selectClass}>
            <option value="">{lang === "es" ? "Cualquier día" : "Any day"}</option>
            {weekdayLabels.map((d, idx) => (
              <option key={idx} value={idx}>
                {d}
              </option>
            ))}
          </select>
        </Field>
      )}
      <label className="flex items-center gap-2 text-base">
        <input type="checkbox" name="photoRequired" defaultChecked={!!task.photo_required} className="h-5 w-5" />
        {lang === "es" ? "Requiere foto" : "Photo required"}
      </label>
      {error && <p className="text-sm text-critical">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50">
          {lang === "es" ? "Guardar" : "Save"}
        </button>
        <button type="button" onClick={onDone} disabled={pending} className="text-sm font-medium text-muted">
          {lang === "es" ? "Cancelar" : "Cancel"}
        </button>
      </div>
    </form>
  );
}

export default function CleaningTaskRow({ task, lang }: { task: CleaningTaskData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
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

  if (editing) {
    return (
      <div className="card p-3">
        <EditTaskForm task={task} lang={lang} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{title}</p>
          <div className="flex flex-wrap items-center gap-x-1 text-sm text-muted">
            {dueDay && <span>{lang === "es" ? "Vence" : "Due"}: {dueDay} ·</span>}
            <AssociateEditor taskId={task.id} associateName={task.associate_name} lang={lang} />
            {task.photo_required ? <span>· 📷 {t(lang, "cleaning_photo_required")}</span> : null}
          </div>
          {task.checklistItems && task.checklistItems.length > 0 ? (
            <details className="mt-1">
              <summary className="cursor-pointer text-sm text-accent">
                {lang === "es" ? "Ver detalle" : "View checklist"} ({task.checklistItems.filter((i) => i.done).length}/{task.checklistItems.length})
              </summary>
              <div className="mt-1 divide-y divide-border">
                {task.checklistItems.map((item) => (
                  <ChecklistItemRow key={item.id} item={item} lang={lang} />
                ))}
              </div>
            </details>
          ) : (
            description && (
              <details className="mt-1">
                <summary className="cursor-pointer text-sm text-accent">{lang === "es" ? "Ver detalle" : "View checklist"}</summary>
                <p className="mt-1 text-sm text-muted">{description}</p>
              </details>
            )
          )}
          <div className="mt-1">
            <StatusBadge status={task.status} lang={lang} />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {task.status === "ASSIGNED" &&
            (needsAfterPhotoToComplete ? (
              <span className="text-xs font-medium text-warning">{lang === "es" ? "Falta foto de después" : "Needs after photo"}</span>
            ) : (
              <button disabled={pending} onClick={() => run(() => completeCleaningAction(task.id))} className="tap-target rounded-full bg-accent px-3 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50">
                {t(lang, "action_complete")}
              </button>
            ))}
          {task.status === "COMPLETED" && (
            <button disabled={pending} onClick={() => run(() => verifyCleaningAction(task.id))} className="tap-target rounded-full border-2 border-ok px-3 text-sm font-semibold text-ok disabled:opacity-50">
              {t(lang, "action_verify")}
            </button>
          )}
          {task.status === "VERIFIED" && (
            <button disabled={pending} onClick={() => run(() => reopenCleaningAction(task.id))} className="tap-target rounded-full border border-border px-3 text-sm text-muted disabled:opacity-50">
              {lang === "es" ? "Reabrir" : "Reopen"}
            </button>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={pending}
              title={lang === "es" ? "Editar" : "Edit"}
              onClick={() => setEditing(true)}
              className="tap-target flex h-7 w-7 min-h-0 items-center justify-center rounded-full text-muted transition-colors hover:text-accent disabled:opacity-40"
            >
              ✎
            </button>
            <button
              type="button"
              disabled={pending}
              title={lang === "es" ? "Eliminar" : "Delete"}
              onClick={() => run(() => deleteCleaningTaskAction(task.id))}
              className="tap-target flex h-7 w-7 min-h-0 items-center justify-center rounded-full text-muted transition-colors hover:text-critical disabled:opacity-40"
            >
              🗑
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <PhotoSlot taskId={task.id} kind="before" url={task.photo_before_url} lang={lang} />
        <PhotoSlot taskId={task.id} kind="after" url={task.photo_after_url} lang={lang} />
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}
    </div>
  );
}
