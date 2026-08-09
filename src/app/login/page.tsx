"use client";

import { useActionState, useMemo } from "react";
import { login, type LoginState } from "./actions";
import { validateLogin } from "@/lib/validation";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<LoginState, FormData>(
    login,
    {},
  );

  // Validação client-side bloqueia o envio e dá feedback imediato (CA 5).
  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const form = event.currentTarget.form;
    if (!form) return;
    const email = String(form.email.value ?? "");
    const password = String(form.password.value ?? "");
    const errors = validateLogin(email, password);
    setFieldError(form, "email", errors.email);
    setFieldError(form, "password", errors.password);
    const submit = form.querySelector(
      "button[type=submit]",
    ) as HTMLButtonElement | null;
    if (submit) submit.disabled = Object.keys(errors).length > 0;
  }

  // A mensagem do servidor (credenciais inválidas) só aparece após submit.
  const serverError = useMemo(() => state.error ?? null, [state]);

  return (
    <main className="min-h-screen flex items-center justify-center">
      <div className="w-full max-w-[28rem] p-6">
        <h1 className="text-3xl font-semibold">Lembr8</h1>
        <p className="mt-2 text-muted">Entre para ver seus lembretes.</p>

        <form action={formAction} className="mt-8 space-y-4" noValidate>
          <div className="space-y-1">
            <label htmlFor="email" className="block text-sm font-medium">
              E-mail
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              onChange={onChange}
              className="w-full rounded border border-current/20 px-3 py-2 text-sm outline-none focus:border-current/50"
            />
            <p
              data-error="email"
              className="text-xs text-red-500 empty:hidden"
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium">
              Senha
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              onChange={onChange}
              className="w-full rounded border border-current/20 px-3 py-2 text-sm outline-none focus:border-current/50"
            />
            <p
              data-error="password"
              className="text-xs text-red-500 empty:hidden"
            />
          </div>

          {serverError ? (
            <p className="text-sm text-red-500">{serverError}</p>
          ) : null}

          <button
            type="submit"
            disabled
            className="w-full rounded bg-foreground text-background px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {isPending ? "Entrando..." : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}

function setFieldError(
  form: HTMLFormElement,
  field: string,
  message: string | undefined,
) {
  const el = form.querySelector(`[data-error="${field}"]`);
  if (el instanceof HTMLElement) el.textContent = message ?? "";
}