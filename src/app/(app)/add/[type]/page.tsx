import { redirect, notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { isGM } from "@/lib/permissions";
import { t } from "@/lib/i18n";
import { storeToday } from "@/lib/storeTime";
import PageHeader from "@/components/PageHeader";
import TaskForm from "@/components/forms/TaskForm";
import TemplatesManager from "@/components/TemplatesManager";
import CallInForm from "@/components/forms/CallInForm";
import LateForm from "@/components/forms/LateForm";
import CleaningForm from "@/components/forms/CleaningForm";
import MealReplacementForm from "@/components/forms/MealReplacementForm";
import BorrowedItemForm from "@/components/forms/BorrowedItemForm";
import IssueForm from "@/components/forms/IssueForm";
import AcknowledgementForm from "@/components/forms/AcknowledgementForm";
import NoteForm from "@/components/forms/NoteForm";
import CateringForm from "@/components/forms/CateringForm";

const TITLE_KEYS: Record<string, string> = {
  task: "add_task",
  "call-in": "add_call_in",
  late: "add_late",
  cleaning: "add_cleaning",
  "meal-replacement": "add_meal_replacement",
  "borrowed-item": "add_borrowed_item",
  issue: "add_issue",
  acknowledgement: "add_acknowledgement",
  note: "add_note",
  catering: "add_catering",
};

// Types reached from their own More page (rather than the /add grid) fall
// back there when there's no real navigation history to go back to.
const BACK_HREF: Record<string, string> = {
  cleaning: "/more/cleaning",
  "meal-replacement": "/more/meal-replacements",
  issue: "/more/work-orders",
  acknowledgement: "/more/acknowledgements",
  catering: "/more/catering",
  "borrowed-item": "/more/borrowed-items",
};

export default async function AddTypePage({ params }: PageProps<"/add/[type]">) {
  const { type } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!TITLE_KEYS[type]) notFound();

  let areas: Array<{ id: string; name: string }> = [];
  if (type === "cleaning") {
    const db = getDb();
    areas = db.prepare(`SELECT id, name FROM cleaning_areas WHERE store_id = ? ORDER BY name`).all(user.storeId) as never;
  }
  let managers: Array<{ id: string; name: string }> = [];
  if (type === "task") {
    const db = getDb();
    managers = db.prepare(`SELECT id, name FROM users WHERE active = 1 AND position != 'ASSOCIATE' ORDER BY name`).all() as never;
  }

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref={BACK_HREF[type] || "/add"} lang={user.language} title={t(user.language, TITLE_KEYS[type] as never)} />
      {type === "task" && (
        <>
          <TaskForm lang={user.language} isGM={isGM(user)} managers={managers} currentUserId={user.id} />
          <details className="mt-6">
            <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-accent">
              {user.language === "es" ? "Administrar tareas recurrentes" : "Manage recurring tasks"}
            </summary>
            <div className="mt-3">
              <TemplatesManager user={user} />
            </div>
          </details>
        </>
      )}
      {type === "call-in" && <CallInForm lang={user.language} />}
      {type === "late" && <LateForm lang={user.language} />}
      {type === "cleaning" && <CleaningForm lang={user.language} areas={areas} />}
      {type === "meal-replacement" && <MealReplacementForm lang={user.language} />}
      {type === "borrowed-item" && <BorrowedItemForm lang={user.language} />}
      {type === "issue" && <IssueForm lang={user.language} />}
      {type === "acknowledgement" && <AcknowledgementForm lang={user.language} />}
      {type === "note" && <NoteForm lang={user.language} />}
      {type === "catering" && <CateringForm lang={user.language} defaultDueDate={storeToday(user.storeId)} />}
    </div>
  );
}
