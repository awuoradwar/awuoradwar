import Link from "next/link";
import { Language } from "@/lib/types";
import { MealReplacementRow as MealReplacementRowData } from "@/lib/services/guestRecoveryService";
import { formatStoreDateTime } from "@/lib/storeTime";

const CATEGORY_LABEL: Record<string, Record<Language, string>> = {
  FOOD_QUALITY: { en: "Food Quality", es: "Calidad de Alimentos" },
  ACCURACY: { en: "Accuracy", es: "Exactitud" },
  SERVICE: { en: "Service", es: "Servicio" },
  CLEANLINESS: { en: "Cleanliness", es: "Limpieza" },
  OTHER: { en: "Other", es: "Otro" },
};

export default function MealReplacementRow({ item, lang, storeId }: { item: MealReplacementRowData; lang: Language; storeId: string }) {
  const timeLabel = formatStoreDateTime(storeId, item.created_at, lang === "es" ? "es-MX" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <Link href={`/guest-recovery/${item.id}`} className="flex items-center gap-2 px-3 py-2">
      <span className="text-lg">🍽️</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm">
          {item.guest_name ? `${item.guest_name} · ` : ""}
          {item.item_description || CATEGORY_LABEL[item.issue_category]?.[lang] || item.issue_category}
        </p>
        <p className="truncate text-xs text-muted">
          {CATEGORY_LABEL[item.issue_category]?.[lang] || item.issue_category} · {timeLabel}
          {item.created_by_name && <span> · {item.created_by_name}</span>}
        </p>
      </div>
    </Link>
  );
}
