"use client";

import { useActionState } from "react";
import { loginAction } from "@/app/actions/auth";
import { inputClass } from "./forms/FormShell";

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
        <label className="mb-1.5 block text-sm font-medium" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="username"
          className={inputClass}
          placeholder="you@store.com"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-sm font-medium" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className={inputClass}
          placeholder="••••••••"
        />
      </div>
      {state.error && (
        <p className="flex items-start gap-2 rounded-lg border-l-4 border-critical bg-critical/[0.06] px-3 py-2 text-sm text-critical">
          <span aria-hidden>⚠</span>
          Incorrect email or password.
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="tap-target mt-2 w-full rounded-xl bg-accent font-semibold text-accent-foreground shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
