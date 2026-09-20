"use client";

import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";

import { authClient } from "@/lib/auth-client";

type DemoCredentials = {
  leadEmail: string;
  managementEmail: string;
  password: string;
};

const subscribeToHydration = () => () => undefined;

export function SignInForm({
  demoCredentials,
}: {
  demoCredentials?: DemoCredentials;
}) {
  const router = useRouter();
  const [error, setError] = useState("");
  const mounted = useSyncExternalStore(
    subscribeToHydration,
    () => true,
    () => false,
  );
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const form = new FormData(event.currentTarget);
    const result = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    setPending(false);
    if (result.error) {
      setError("Не удалось войти. Проверьте почту и пароль.");
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={onSubmit}>
      <p className="eyebrow">Вход в систему</p>
      <h2>Добро пожаловать</h2>
      <p className="subtle">Используйте рабочую учетную запись.</p>
      <div className="field">
        <label htmlFor="email">Электронная почта</label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={demoCredentials?.leadEmail}
          autoComplete="email"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="password">Пароль</label>
        <input
          id="password"
          name="password"
          type="password"
          defaultValue={demoCredentials?.password}
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      <button className="button" type="submit" disabled={!mounted || pending}>
        {pending ? "Входим…" : "Войти"}
      </button>
      {demoCredentials ? (
        <div className="auth-hint">
          Демо-лид: {demoCredentials.leadEmail}
          <br />
          Руководство: {demoCredentials.managementEmail}
          <br />
          Пароль для обеих ролей: {demoCredentials.password}
        </div>
      ) : null}
    </form>
  );
}
