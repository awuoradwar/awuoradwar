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
    <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{storeName}</p>
          <p className="truncate text-xs text-muted">
            {picName ? `PIC: ${picName}` : "No PIC assigned"} · {POSITION_LABEL[user.position][user.language]}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <LanguageToggle lang={user.language} />
          <form action={logoutAction}>
            <button
              type="submit"
              className="tap-target rounded-lg border border-border px-2 text-xs font-medium text-muted"
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
