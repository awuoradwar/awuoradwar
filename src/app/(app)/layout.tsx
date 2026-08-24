import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentPicForStore } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureInstancesForWeek, weekStartOf } from "@/lib/services/recurrenceService";
import { resetDueWeeklyCleaningTasks, resetDueDailyCleaningTasks } from "@/lib/services/cleaningService";
import { storeToday } from "@/lib/storeTime";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import OfflineQueueBanner from "@/components/OfflineQueueBanner";
import AutoRefresh from "@/components/AutoRefresh";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const today = storeToday(user.storeId);
  ensureInstancesForWeek(user.storeId, weekStartOf(today));
  resetDueWeeklyCleaningTasks(user.storeId);
  resetDueDailyCleaningTasks(user.storeId);

  const db = getDb();
  const store = db.prepare(`SELECT * FROM stores WHERE id = ?`).get(user.storeId) as { name: string } | undefined;
  const shift = getCurrentPicForStore(user.storeId);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AutoRefresh />
      <TopBar user={user} storeName={store?.name || "Store"} picNames={shift.picDisplayNames} picPosition={shift.picDisplayPosition} />
      <OfflineQueueBanner lang={user.language} />
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <BottomNav lang={user.language} />
    </div>
  );
}
