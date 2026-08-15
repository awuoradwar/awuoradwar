import { redirect } from "next/navigation";
import { getCurrentUser, getCurrentPicForStore } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { ensureInstancesForWeek, weekStartOf } from "@/lib/services/recurrenceService";
import BottomNav from "@/components/BottomNav";
import TopBar from "@/components/TopBar";
import OfflineQueueBanner from "@/components/OfflineQueueBanner";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const today = new Date().toISOString().slice(0, 10);
  ensureInstancesForWeek(user.storeId, weekStartOf(today));

  const db = getDb();
  const store = db.prepare(`SELECT * FROM stores WHERE id = ?`).get(user.storeId) as { name: string } | undefined;
  const shift = getCurrentPicForStore(user.storeId);

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <TopBar user={user} storeName={store?.name || "Store"} picName={shift?.pic_name || null} />
      <OfflineQueueBanner lang={user.language} />
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <BottomNav lang={user.language} />
    </div>
  );
}
