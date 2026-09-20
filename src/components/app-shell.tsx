import { FilePenLine, LayoutDashboard } from "lucide-react";
import Link from "next/link";

import type { AppSession } from "@/modules/auth/session";
import { SignOutButton } from "./sign-out-button";

export function AppShell({
  session,
  active,
  children,
}: {
  session: AppSession;
  active: "portfolio" | "report";
  children: React.ReactNode;
}) {
  const management = session.user.role === "MANAGEMENT";

  return (
    <div className="app-shell">
      <aside className="side-nav">
        <Link className="brand" href="/">
          <span className="brand-mark">К</span>
          Контур
        </Link>
        <nav>
          <div className="nav-label">Рабочее пространство</div>
          {management ? (
            <Link
              className={`nav-link ${active === "portfolio" ? "active" : ""}`}
              href="/portfolio"
            >
              <LayoutDashboard size={17} />
              Портфель продуктов
            </Link>
          ) : (
            <Link
              className={`nav-link ${active === "report" ? "active" : ""}`}
              href="/my-report"
            >
              <FilePenLine size={17} />
              Мой отчет
            </Link>
          )}
        </nav>
        <div className="user-block">
          <div className="user-name">{session.user.name}</div>
          <div className="user-role">
            {management ? "Руководство" : "Лид продукта"}
          </div>
          <SignOutButton />
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
