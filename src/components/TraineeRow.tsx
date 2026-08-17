import Link from "next/link";
import { TraineeRow as TraineeRowData } from "@/lib/services/trainingService";
import { TRAINING_POSITION_LABEL } from "@/lib/trainingLabels";
import { Language } from "@/lib/types";

export default function TraineeRow({ item, lang }: { item: TraineeRowData; lang: Language }) {
  const pct = item.total_count > 0 ? Math.round((item.completed_count / item.total_count) * 100) : 0;
  return (
    <Link href={`/more/training/${item.id}`} className="flex items-center gap-3 px-3 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{item.name}</p>
          <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold text-accent">
            {TRAINING_POSITION_LABEL[item.position][lang]}
          </span>
          {item.status === "COMPLETE" && (
            <span className="shrink-0 rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-bold text-ok">
              {lang === "es" ? "COMPLETO" : "COMPLETE"}
            </span>
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
            <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-[11px] text-muted">
            {item.completed_count}/{item.total_count}
          </span>
        </div>
      </div>
    </Link>
  );
}
