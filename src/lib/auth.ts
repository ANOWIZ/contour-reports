import "server-only";

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@/db";
import { account, session, user, verification } from "@/db/schema";
import { emailAndPasswordAuthOptions } from "@/lib/auth-policy";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: emailAndPasswordAuthOptions,
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "PRODUCT_LEAD",
        input: false,
      },
      productId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
});
