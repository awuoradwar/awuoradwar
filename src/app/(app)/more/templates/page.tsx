import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import TemplatesManager from "@/components/TemplatesManager";
import PageHeader from "@/components/PageHeader";

// Templates now live primarily under Quick Log > Task ("Manage recurring
// tasks") since that's where a manager is already thinking about tasks --
// this route stays live as a direct link for anyone with it bookmarked, and
// shares the exact same component so the two entry points never drift.
export default async function TemplatesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <PageHeader backHref="/more" lang={user.language} title={user.language === "es" ? "Plantillas" : "Templates"} />
      <TemplatesManager user={user} />
    </div>
  );
}
