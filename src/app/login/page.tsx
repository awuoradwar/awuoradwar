import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import LoginForm from "@/components/LoginForm";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/my-shift");

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-12 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-2xl font-bold text-accent-foreground shadow-md">
            SO
          </div>
          <h1 className="text-2xl font-semibold">Shift Ops</h1>
          <p className="mt-1 text-sm text-muted">
            The store already knows the routine. Sign in to tell it what changed.
          </p>
        </div>
        <LoginForm />
        <div className="mt-8 rounded-xl border border-border bg-card p-4 text-xs text-muted">
          <p className="mb-1 font-medium text-foreground">Demo accounts (password: shiftops123)</p>
          <p>gm@shiftops.demo — General Manager</p>
          <p>am@shiftops.demo — Assistant Manager</p>
          <p>chef@shiftops.demo — Chef (Spanish UI)</p>
          <p>visiting@shiftops.demo — Visiting Manager</p>
        </div>
      </div>
    </div>
  );
}
