"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addIssueUpdateAction, resolveIssueAction, reopenIssueAction, updateIssueAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { Field, inputClass, selectClass, textareaClass } from "./forms/FormShell";

export default function IssueDetailActions({
  id,
  lang,
  status,
  category,
  description,
  severity,
  dueDate,
}: {
  id: string;
  lang: Language;
  status: string;
  category: string;
  description: string;
  severity: string;
  dueDate: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [resolving, setResolving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  const isResolved = status === "RESOLVED";

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          startTransition(async () => {
            const result = await updateIssueAction(fd);
            if (result && "error" in result && result.error) {
              setEditError(result.error);
              return;
            }
            setEditError(null);
            setEditing(false);
            router.refresh();
          });
        }}
        className="flex flex-col gap-3"
      >
        <input type="hidden" name="id" value={id} />
        <Field label={lang === "es" ? "Categoría" : "Category"}>
          <select name="category" defaultValue={category} className={selectClass}>
            <option value="EQUIPMENT">{lang === "es" ? "Equipo" : "Equipment"}</option>
            <option value="FACILITIES">{lang === "es" ? "Instalaciones" : "Facilities"}</option>
            <option value="OPERATIONAL">{lang === "es" ? "Operativo" : "Operational"}</option>
            <option value="OTHER">{lang === "es" ? "Otro" : "Other"}</option>
          </select>
        </Field>
        <Field label={lang === "es" ? "Descripción" : "Description"}>
          <textarea name="description" defaultValue={description} required rows={3} className={textareaClass} />
        </Field>
        <Field label={lang === "es" ? "Gravedad" : "Severity"}>
          <select name="severity" defaultValue={severity} className={selectClass}>
            <option value="NORMAL">{lang === "es" ? "Normal" : "Normal"}</option>
            <option value="CRITICAL">{lang === "es" ? "Crítico" : "Critical"}</option>
          </select>
        </Field>
        <Field label={lang === "es" ? "Fecha límite (opcional)" : "Due date (optional)"}>
          <input name="dueDate" type="date" defaultValue={dueDate || ""} className={inputClass} />
        </Field>
        {editError && <p className="text-sm text-critical">{editError}</p>}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={pending} className="tap-target rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground disabled:opacity-50">
            {lang === "es" ? "Guardar" : "Save"}
          </button>
          <button type="button" onClick={() => setEditing(false)} disabled={pending} className="text-sm font-medium text-muted">
            {lang === "es" ? "Cancelar" : "Cancel"}
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="tap-target self-start rounded-full border border-border px-4 text-sm font-semibold text-muted transition-colors hover:border-accent hover:text-accent"
      >
        ✎ {lang === "es" ? "Editar" : "Edit"}
      </button>
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
                disabled={pending}
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
                disabled={pending}
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
              className="tap-target self-start rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover"
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
                className="tap-target self-start rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
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
