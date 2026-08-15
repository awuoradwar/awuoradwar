import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { isGM, POSITION_LABEL } from "@/lib/permissions";
import { getDb } from "@/lib/db";
import UserAdminForm from "@/components/UserAdminForm";
import DeactivateUserButton from "@/components/DeactivateUserButton";
import { Position } from "@/lib/types";

export default async function AdminPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  // GM-only screen -- explicitly enumerated GM power (spec section 2). AM and
  // Chef are turned away with the same friendly message, never a crash.
  if (!isGM(user)) {
    return (
      <div className="mx-auto max-w-md px-4 py-5">
        <Link href="/more" className="mb-3 inline-block text-sm text-muted">
          ← {user.language === "es" ? "Atrás" : "Back"}
        </Link>
        <div className="card p-6 text-center">
          <p className="text-2xl">🛡️</p>
          <p className="mt-2 text-sm font-medium">
            {user.language === "es" ? "Solo el GM puede acceder a Administración." : "Only the GM can access Admin."}
          </p>
        </div>
      </div>
    );
  }

  const db = getDb();
  const users = db
    .prepare(`SELECT id, name, email, position, active FROM users WHERE id != ? ORDER BY active DESC, name`)
    .all(user.id) as Array<{ id: string; name: string; email: string; position: Position; active: number }>;

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <Link href="/more" className="mb-3 inline-block text-sm text-muted">
        ← {user.language === "es" ? "Atrás" : "Back"}
      </Link>
      <h1 className="mb-1 text-lg font-semibold">{user.language === "es" ? "Administración" : "Admin"}</h1>
      <p className="mb-4 text-xs text-muted">
        {user.language === "es"
          ? "Recuerda: Gerente Asistente y Chef tienen exactamente los mismos permisos."
          : "Reminder: Assistant Manager and Chef always have exactly the same permissions."}
      </p>

      <section className="mb-6">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Agregar usuario" : "Add user"}
        </h2>
        <UserAdminForm lang={user.language} />
      </section>

      <section>
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wide text-accent">
          {user.language === "es" ? "Usuarios" : "Users"}
        </h2>
        <div className="card divide-y divide-border">
          {users.map((u) => (
            <div key={u.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{u.name}</p>
                <p className="text-xs text-muted">
                  {u.email} · {POSITION_LABEL[u.position][user.language]}
                </p>
              </div>
              {u.active ? <DeactivateUserButton id={u.id} lang={user.language} /> : <span className="text-xs text-muted">Inactive</span>}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
