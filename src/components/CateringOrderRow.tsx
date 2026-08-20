"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  updateCateringOrderAction,
  completeCateringOrderAction,
  cancelCateringOrderAction,
  reopenCateringOrderAction,
} from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";
import { cateringChannelLabel } from "@/lib/cateringLabels";
import StatusBadge from "./StatusBadge";
import { Field, inputClass, selectClass, textareaClass, btnPrimary, btnOutline, btnDanger, btnNeutral } from "./forms/FormShell";

export interface CateringOrderData {
  id: string;
  due_date: string;
  pickup_time: string | null;
  customer_name: string | null;
  number_of_people: number | null;
  channel: string;
  notes: string | null;
  status: string;
  completed_by_name?: string | null;
}

function EditCateringForm({ order, lang, onDone }: { order: CateringOrderData; lang: Language; onDone: () => void }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await updateCateringOrderAction(fd);
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
      <input type="hidden" name="id" value={order.id} />
      <div className="grid grid-cols-2 gap-2">
        <Field label={t(lang, "field_due_date")}>
          <input name="dueDate" type="date" required defaultValue={order.due_date} className={inputClass} />
        </Field>
        <Field label={t(lang, "field_pickup_time")}>
          <input name="pickupTime" type="time" defaultValue={order.pickup_time || ""} className={inputClass} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label={t(lang, "field_number_of_people")}>
          <input name="numberOfPeople" type="number" min="1" step="1" defaultValue={order.number_of_people ?? undefined} className={inputClass} />
        </Field>
        <Field label={t(lang, "field_channel")}>
          <select name="channel" defaultValue={order.channel} className={selectClass}>
            <option value="OLO">OLO</option>
            <option value="EZCATERING">EZCater</option>
            <option value="IN_STORE">{lang === "es" ? "En Tienda" : "In-Store"}</option>
            <option value="PHONE">{lang === "es" ? "Teléfono" : "Phone"}</option>
          </select>
        </Field>
      </div>
      <Field label={t(lang, "field_customer_name")}>
        <input name="customerName" defaultValue={order.customer_name || ""} className={inputClass} />
      </Field>
      <Field label={t(lang, "field_notes")}>
        <textarea name="notes" rows={2} defaultValue={order.notes || ""} className={textareaClass} />
      </Field>
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

export default function CateringOrderRow({ order, lang }: { order: CateringOrderData; lang: Language }) {
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const router = useRouter();

  function run(fn: () => Promise<void>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="card p-3">
        <EditCateringForm order={order} lang={lang} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="card flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">
            {order.number_of_people ? `${order.number_of_people} ${lang === "es" ? "personas" : "people"}` : lang === "es" ? "Catering" : "Catering"}
            {order.customer_name ? ` · ${order.customer_name}` : ""}
          </p>
          <p className="text-sm text-muted">
            {order.pickup_time ? `${lang === "es" ? "Recoge" : "Pickup"} ${order.pickup_time}` : lang === "es" ? "Sin hora fijada" : "No time set"}
            {" · "}
            {cateringChannelLabel(order.channel, lang)}
          </p>
          {order.notes && (
            <details className="mt-1">
              <summary className="cursor-pointer text-sm text-accent">{lang === "es" ? "Ver notas" : "View notes"}</summary>
              <p className="mt-1 text-sm text-muted">{order.notes}</p>
            </details>
          )}
          {order.completed_by_name && order.status !== "OPEN" && (
            <p className="mt-1 text-xs text-muted">
              {order.status === "CANCELLED" ? (lang === "es" ? "Cancelado por" : "Cancelled by") : lang === "es" ? "Completado por" : "Completed by"}{" "}
              {order.completed_by_name}
            </p>
          )}
          <div className="mt-1">
            <StatusBadge status={order.status} lang={lang} />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {order.status === "OPEN" && (
            <>
              <button disabled={pending} onClick={() => run(() => completeCateringOrderAction(order.id))} className={btnPrimary}>
                {t(lang, "action_complete")}
              </button>
              <button disabled={pending} onClick={() => run(() => cancelCateringOrderAction(order.id))} className={btnDanger}>
                {lang === "es" ? "Cancelar" : "Cancel"}
              </button>
            </>
          )}
          {order.status !== "OPEN" && (
            <button disabled={pending} onClick={() => run(() => reopenCateringOrderAction(order.id))} className={btnNeutral}>
              {lang === "es" ? "Reabrir" : "Reopen"}
            </button>
          )}
          <button type="button" disabled={pending} onClick={() => setEditing(true)} className={`gap-1 ${btnOutline}`}>
            ✎ {lang === "es" ? "Editar" : "Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}
