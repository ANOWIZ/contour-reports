export const emailAndPasswordAuthOptions = {
  enabled: true,
  disableSignUp: true,
  minPasswordLength: 8,
} as const;

export function shouldShowDemoCredentials(environment: string | undefined) {
  return environment === "development";
}
