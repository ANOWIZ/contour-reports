import { describe, expect, it } from "vitest";

import {
  emailAndPasswordAuthOptions,
  shouldShowDemoCredentials,
} from "./auth-policy";

describe("authentication policy", () => {
  it("keeps public email sign-up disabled", () => {
    expect(emailAndPasswordAuthOptions).toEqual({
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
    });
  });

  it("shows demo credentials only in development", () => {
    expect(shouldShowDemoCredentials("development")).toBe(true);
    expect(shouldShowDemoCredentials("production")).toBe(false);
    expect(shouldShowDemoCredentials("test")).toBe(false);
    expect(shouldShowDemoCredentials(undefined)).toBe(false);
  });
});
