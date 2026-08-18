import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { POSITION_LABEL, isGM } from "@/lib/permissions";
import LanguageToggle from "@/components/LanguageToggle";
import PageHeader from "@/components/PageHeader";
import PushNotificationToggle from "@/components/PushNotificationToggle";
import EditNameForm from "@/components/EditNameForm";
import EditStoreForm from "@/components/EditStoreForm";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const db = getDb();
  const store = db.prepare(`SELECT * FROM stores WHERE id = ?`).get(user.storeId) as
    | { name: string; timezone: string }
    | undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Configuración" : "Settings"} />

      <section className="mb-4 card flex flex-col gap-2 p-4">
        <p className="text-sm font-semibold">{user.name}</p>
        <p className="text-xs text-muted">{user.email}</p>
        <p className="text-xs text-muted">{POSITION_LABEL[user.position][user.language]}</p>
        <EditNameForm name={user.name} lang={user.language} />
      </section>

      <section className="mb-4 flex items-center justify-between card p-4">
        <div>
          <p className="text-sm font-medium">{user.language === "es" ? "Idioma" : "Language"}</p>
          <p className="text-xs text-muted">{user.language === "es" ? "Español" : "English"}</p>
        </div>
        <LanguageToggle lang={user.language} />
      </section>

      <PushNotificationToggle lang={user.language} />

      <section className="card flex flex-col gap-2 p-4">
        <p className="text-sm font-medium">{store?.name}</p>
        <p className="text-xs text-muted">{store?.timezone}</p>
        {isGM(user) && <EditStoreForm name={store?.name || ""} timezone={store?.timezone || "America/Chicago"} lang={user.language} />}
      </section>
    </div>
  );
}
