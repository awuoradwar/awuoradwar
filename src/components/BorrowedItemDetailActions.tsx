"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { selectSettlementAction, settleBorrowedItemAction } from "@/app/actions/operationsActions";
import { Language } from "@/lib/types";
import { t } from "@/lib/i18n";

const METHODS: Array<{ value: "RETURN_PRODUCT" | "CRUNCHTIME_TRANSFER" | "PENDING_CONFIRMATION"; key: string }> = [
  { value: "RETURN_PRODUCT", key: "action_settlement_return" },
  { value: "CRUNCHTIME_TRANSFER", key: "action_settlement_crunchtime" },
  { value: "PENDING_CONFIRMATION", key: "action_settlement_pending" },
];

export default function BorrowedItemDetailActions({
  id,
  lang,
  status,
  settlementMethod,
}: {
  id: string;
  lang: Language;
  status: string;
  settlementMethod: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function run(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  if (status === "SETTLED") return null;

  return (
    <div className="flex flex-col gap-3">
      {!settlementMethod ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">{t(lang, "field_settlement_method")}</p>
          <div className="flex flex-wrap gap-2">
            {METHODS.map((m) => (
              <button
                key={m.value}
                disabled={pending}
                onClick={() => run(() => selectSettlementAction(id, m.value))}
                className="tap-target rounded-full border border-border px-4 text-sm font-semibold text-muted disabled:opacity-50"
              >
                {t(lang, m.key as never)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted">
            {t(lang, "detail_settlement_selected")}: {t(lang, (METHODS.find((m) => m.value === settlementMethod)?.key || "field_settlement_method") as never)}
          </p>
          <button
            disabled={pending}
            onClick={() => run(() => settleBorrowedItemAction(id))}
            className="tap-target self-start rounded-full bg-accent px-4 text-sm font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {t(lang, "action_settle")}
          </button>
        </div>
      )}
    </div>
  );
}
