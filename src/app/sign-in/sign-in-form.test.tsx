import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    signIn: {
      email: vi.fn(),
    },
  },
}));

import { SignInForm } from "./sign-in-form";

describe("sign-in form demo credentials", () => {
  it("does not render demo credentials when they are not provided", () => {
    const markup = renderToStaticMarkup(<SignInForm />);

    expect(markup).not.toContain("lead@contour.local");
    expect(markup).not.toContain("management@contour.local");
    expect(markup).not.toContain("demo-report");
    expect(markup).not.toContain("auth-hint");
  });

  it("renders development-only credentials when explicitly provided", () => {
    const markup = renderToStaticMarkup(
      <SignInForm
        demoCredentials={{
          leadEmail: "lead@contour.local",
          managementEmail: "management@contour.local",
          password: "demo-report",
        }}
      />,
    );

    expect(markup).toContain("lead@contour.local");
    expect(markup).toContain("management@contour.local");
    expect(markup).toContain("demo-report");
    expect(markup).toContain("auth-hint");
  });
});
