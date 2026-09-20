import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

export type AppRole = "MANAGEMENT" | "PRODUCT_LEAD";

export type AppSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: AppRole;
    productId: string | null;
  };
};

export async function getAppSession(): Promise<AppSession | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  return {
    user: {
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: session.user.role as AppRole,
      productId: session.user.productId ?? null,
    },
  };
}

export async function requireSession() {
  const session = await getAppSession();
  if (!session) redirect("/sign-in");
  return session;
}

export async function requireManagement() {
  const session = await requireSession();
  if (session.user.role !== "MANAGEMENT") redirect("/my-report");
  return session;
}

export async function requireProductLead() {
  const session = await requireSession();
  if (session.user.role !== "PRODUCT_LEAD" || !session.user.productId) {
    redirect("/portfolio");
  }
  return session;
}
