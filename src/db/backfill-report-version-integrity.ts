import { eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { reportVersions } from "./schema";
import {
  parseReportContent,
  reportCompleteness,
} from "../modules/reports/content";
import { reportContentHash } from "../modules/reports/integrity";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://reporting:reporting_dev@localhost:5433/product_reporting";
const sql = postgres(connectionString, { max: 1, prepare: false });
const scriptDb = drizzle(sql);

async function main() {
  const versions = await scriptDb
    .select({
      id: reportVersions.id,
      content: reportVersions.content,
    })
    .from(reportVersions)
    .where(isNull(reportVersions.contentHash));

  for (const version of versions) {
    const content = parseReportContent(version.content);
    await scriptDb
      .update(reportVersions)
      .set({
        contentHash: reportContentHash(content),
        completeness: reportCompleteness(content).percent,
      })
      .where(eq(reportVersions.id, version.id));
  }

  console.log(`Backfilled report version integrity: ${versions.length}`);
  await sql.end();
}

main().catch((error) => {
  console.error(error);
  void sql.end();
  process.exitCode = 1;
});
