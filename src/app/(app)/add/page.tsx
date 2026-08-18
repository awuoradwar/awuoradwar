import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { t } from "@/lib/i18n";

// Cleaning, Meal Replacement, Issue (Work Order), and Acknowledgement each
// have their own dedicated management page under More, so their "add new"
// entry point lives there instead of being duplicated here -- one home per
// feature. Only things with no dedicated list page stay on this quick grid.
const TYPES = [
  { slug: "task", key: "add_task", icon: "✅" },
  { slug: "call-in", key: "add_call_in", icon: "📵" },
  { slug: "late", key: "add_late", icon: "⏱️" },
  { slug: "borrowed-item", key: "add_borrowed_item", icon: "📦" },
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
