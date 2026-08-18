import { SessionUser, Position } from "@/lib/types";
import { POSITION_LABEL } from "@/lib/permissions";
import LanguageToggle from "./LanguageToggle";
import { logoutAction } from "@/app/actions/auth";

export default function TopBar({
  user,
  storeName,
  picNames,
  picPosition,
}: {
  user: SessionUser;
  storeName: string;
  picNames: string[] | null;
  picPosition: Position | null;
}) {
  // A single PIC shows their own title ("PIC: Eva · Assistant Manager").
  // Two co-PICs (e.g. an AM and Chef covering together with no GM on) have
  // no single title to show, so it's just their names joined together.
  const picLabel =
    picNames && picNames.length > 0
      ? picNames.length === 1 && picPosition
        ? `PIC: ${picNames[0]} · ${POSITION_LABEL[picPosition][user.language]}`
        : `PIC: ${picNames.join(" & ")}`
      : "No PIC assigned";

  return (
    <header className="sticky top-0 z-20 border-b-2 border-accent bg-chrome-bg text-chrome-fg">
      <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{storeName}</p>
          <p className="truncate text-xs text-chrome-muted">{picLabel}</p>
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
