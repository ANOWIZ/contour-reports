import { redirect } from "next/navigation";

import { getAppSession } from "@/modules/auth/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getAppSession();
  if (!session) redirect("/sign-in");
  redirect(session.user.role === "MANAGEMENT" ? "/portfolio" : "/my-report");
}
