"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";

type State = { error?: string };

async function action(_prev: State, formData: FormData): Promise<State> {
  const result = await loginAction(formData);
  return result || {};
}

export default function LoginForm() {
  const [state, formAction, pending] = useActionState<State, FormData>(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className="tap-target w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:border-accent"
          placeholder="you@store.com"
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="tap-target w-full rounded-xl border border-border bg-card px-4 text-base outline-none focus:border-accent"
          placeholder="••••••••"
        />
      </div>
      {state.error && (
        <p className="rounded-lg bg-critical/10 px-3 py-2 text-sm text-critical">
          Incorrect email or password.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="tap-target mt-2 w-full rounded-xl bg-accent font-semibold text-accent-foreground disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
