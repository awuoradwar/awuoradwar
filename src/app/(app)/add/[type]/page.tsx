import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { t } from "@/lib/i18n";
import TaskForm from "@/components/forms/TaskForm";
import CallInForm from "@/components/forms/CallInForm";
import LateForm from "@/components/forms/LateForm";
import CleaningForm from "@/components/forms/CleaningForm";
import GuestRecoveryForm from "@/components/forms/GuestRecoveryForm";
import MealReplacementForm from "@/components/forms/MealReplacementForm";
import BorrowedItemForm from "@/components/forms/BorrowedItemForm";
import IssueForm from "@/components/forms/IssueForm";
import AcknowledgementForm from "@/components/forms/AcknowledgementForm";
import NoteForm from "@/components/forms/NoteForm";

const TITLE_KEYS: Record<string, string> = {
  task: "add_task",
  "call-in": "add_call_in",
  late: "add_late",
  cleaning: "add_cleaning",
  "guest-recovery": "add_guest_recovery",
  "meal-replacement": "add_meal_replacement",
  "borrowed-item": "add_borrowed_item",
  issue: "add_issue",
  acknowledgement: "add_acknowledgement",
  note: "add_note",
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

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <Link href="/add" className="mb-3 inline-block text-sm text-muted">
        ← {user.language === "es" ? "Atrás" : "Back"}
      </Link>
      <h1 className="mb-4 text-lg font-semibold">{t(user.language, TITLE_KEYS[type] as never)}</h1>
      {type === "task" && <TaskForm lang={user.language} />}
      {type === "call-in" && <CallInForm lang={user.language} />}
      {type === "late" && <LateForm lang={user.language} />}
      {type === "cleaning" && <CleaningForm lang={user.language} areas={areas} />}
      {type === "guest-recovery" && <GuestRecoveryForm lang={user.language} />}
      {type === "meal-replacement" && <MealReplacementForm lang={user.language} />}
      {type === "borrowed-item" && <BorrowedItemForm lang={user.language} />}
      {type === "issue" && <IssueForm lang={user.language} />}
      {type === "acknowledgement" && <AcknowledgementForm lang={user.language} />}
      {type === "note" && <NoteForm lang={user.language} />}
    </div>
  );
}
