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
            M
          </div>
          <h1 className="text-2xl font-semibold">Moshe</h1>
          <p className="mt-1 text-sm text-muted">
            The store already knows the routine. Sign in to tell it what changed.
          </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
