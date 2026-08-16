import { SessionUser } from "@/lib/types";
import { POSITION_LABEL } from "@/lib/permissions";
import LanguageToggle from "./LanguageToggle";
import { logoutAction } from "@/app/actions/auth";

export default function TopBar({
  user,
  storeName,
  picName,
}: {
  user: SessionUser;
  storeName: string;
  picName: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 border-b-2 border-accent bg-chrome-bg text-chrome-fg">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{storeName}</p>
          <p className="truncate text-xs text-chrome-muted">
            {picName ? `PIC: ${picName}` : "No PIC assigned"} · {POSITION_LABEL[user.position][user.language]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle lang={user.language} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="tap-target rounded-lg border border-chrome-border px-2 text-xs font-medium text-chrome-muted transition-colors hover:border-chrome-muted hover:text-chrome-fg"
              aria-label="Sign out"
            >
              {user.language === "en" ? "Sign out" : "Salir"}
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
