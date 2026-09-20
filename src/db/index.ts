import "server-only";

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://reporting:reporting_dev@localhost:5433/product_reporting";

const globalForDatabase = globalThis as unknown as {
  reportingSql?: ReturnType<typeof postgres>;
};

const client =
  globalForDatabase.reportingSql ??
  postgres(connectionString, {
    max: process.env.NODE_ENV === "production" ? 10 : 3,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDatabase.reportingSql = client;
}

export const db = drizzle(client, { schema });
