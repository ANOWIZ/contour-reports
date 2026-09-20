import { redirect } from "next/navigation";

import { shouldShowDemoCredentials } from "@/lib/auth-policy";
import { getAppSession } from "@/modules/auth/session";
import { SignInForm } from "./sign-in-form";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  const session = await getAppSession();
  if (session) redirect("/");
  const demoCredentials = shouldShowDemoCredentials(process.env.NODE_ENV)
    ? {
        leadEmail: "lead@contour.local",
        managementEmail: "management@contour.local",
        password: "demo-report",
      }
    : undefined;

  return (
    <div className="auth-page">
      <section className="auth-story">
        <div className="brand">
          <span className="brand-mark">К</span>
          Контур
        </div>
        <div className="auth-copy">
          <p className="eyebrow">Продуктовая отчетность</p>
          <h1>Одна картина вместо десятка презентаций.</h1>
          <p>
            Лиды обновляют показатели в едином формате. Руководство видит
            динамику, отклонения и риски по всему портфелю сразу.
          </p>
        </div>
        <div className="auth-caption">Внутренний контур · квартальный цикл</div>
      </section>
      <section className="auth-panel">
        <SignInForm demoCredentials={demoCredentials} />
      </section>
    </div>
  );
}
