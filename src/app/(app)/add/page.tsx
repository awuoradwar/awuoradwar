import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

const TYPES = [
  { slug: "task", key: "add_task", icon: "✅" },
  { slug: "call-in", key: "add_call_in", icon: "📵" },
  { slug: "late", key: "add_late", icon: "⏱️" },
  { slug: "cleaning", key: "add_cleaning", icon: "🧹" },
  { slug: "guest-recovery", key: "add_guest_recovery", icon: "🍽️" },
  { slug: "meal-replacement", key: "add_meal_replacement", icon: "🍱" },
  { slug: "borrowed-item", key: "add_borrowed_item", icon: "📦" },
  { slug: "issue", key: "add_issue", icon: "⚠️" },
  { slug: "acknowledgement", key: "add_acknowledgement", icon: "📋" },
  { slug: "note", key: "add_note", icon: "📝" },
] as const;

export default async function AddPickerPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <h1 className="mb-4 text-lg font-semibold">{t(user.language, "action_add")}</h1>
      <div className="grid grid-cols-2 gap-3">
        {TYPES.map((type) => (
          <Link
            key={type.slug}
            href={`/add/${type.slug}`}
            className="tap-target card flex flex-col items-center justify-center gap-2 p-5 text-center text-sm font-medium"
          >
            <span className="text-2xl">{type.icon}</span>
            {t(user.language, type.key as never)}
          </Link>
        ))}
      </div>
    </div>
  );
}
