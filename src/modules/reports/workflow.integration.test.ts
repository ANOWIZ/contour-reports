import { randomUUID } from "node:crypto";

import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { defaultFullReportContent } from "./content";

const runDatabaseTests = process.env.RUN_DB_INTEGRATION === "1";
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://reporting:reporting_dev@localhost:5433/product_reporting";

describeDatabase("report workflow database guards", () => {
  const sql = postgres(connectionString, { max: 1, prepare: false });
  const suffix = randomUUID();
  const productA = `integration-product-a-${suffix}`;
  const productB = `integration-product-b-${suffix}`;
  const periodId = `integration-period-${suffix}`;
  const reportId = `integration-report-${suffix}`;
  const year = 3000 + Math.floor(Math.random() * 100_000);

  beforeAll(async () => {
    await sql`
      INSERT INTO products (id, name, code, accent)
      VALUES
        (${productA}, 'Integration A', ${`IA-${suffix}`}, '#ea5b24'),
        (${productB}, 'Integration B', ${`IB-${suffix}`}, '#ea5b24')
    `;
    await sql`
      INSERT INTO reporting_periods (
        id, year, quarter, label, starts_at, ends_at, is_active
      )
      VALUES (
        ${periodId},
        ${year},
        1,
        'Integration period',
        '3000-01-01T00:00:00.000Z',
        '3000-03-31T23:59:59.000Z',
        false
      )
    `;
    await sql`
      INSERT INTO reports (
        id, product_id, period_id, status, revision, version, content
      )
      VALUES (
        ${reportId},
        ${productA},
        ${periodId},
        'DRAFT',
        0,
        0,
        ${sql.json(defaultFullReportContent)}
      )
    `;
  });

  afterAll(async () => {
    await sql`DELETE FROM reports WHERE id = ${reportId}`;
    await sql`DELETE FROM reporting_periods WHERE id = ${periodId}`;
    await sql`DELETE FROM products WHERE id IN (${productA}, ${productB})`;
    await sql.end();
  });

  it("enforces product ownership, expected revision and editable status", async () => {
    const foreignOwner = await sql`
      UPDATE reports
      SET revision = revision + 1
      WHERE
        id = ${reportId}
        AND product_id = ${productB}
        AND revision = 0
        AND status IN ('DRAFT', 'RETURNED')
      RETURNING revision
    `;
    expect(foreignOwner).toHaveLength(0);

    const firstSave = await sql`
      UPDATE reports
      SET revision = revision + 1
      WHERE
        id = ${reportId}
        AND product_id = ${productA}
        AND revision = 0
        AND status IN ('DRAFT', 'RETURNED')
      RETURNING revision
    `;
    expect(firstSave[0]?.revision).toBe(1);

    const staleSave = await sql`
      UPDATE reports
      SET revision = revision + 1
      WHERE
        id = ${reportId}
        AND product_id = ${productA}
        AND revision = 0
        AND status IN ('DRAFT', 'RETURNED')
      RETURNING revision
    `;
    expect(staleSave).toHaveLength(0);

    await sql`UPDATE reports SET status = 'SUBMITTED' WHERE id = ${reportId}`;
    const afterSubmit = await sql`
      UPDATE reports
      SET revision = revision + 1
      WHERE
        id = ${reportId}
        AND product_id = ${productA}
        AND revision = 1
        AND status IN ('DRAFT', 'RETURNED')
      RETURNING revision
    `;
    expect(afterSubmit).toHaveLength(0);
  });

  it("keeps a submitted snapshot unchanged when the working copy changes", async () => {
    const snapshot = structuredClone(defaultFullReportContent);
    snapshot.summary.quarterResult = "Отправленная версия";
    await sql`
      INSERT INTO report_versions (
        id,
        report_id,
        version_number,
        report_revision,
        content,
        product_name,
        product_code,
        period_label
      )
      VALUES (
        ${`integration-version-${suffix}`},
        ${reportId},
        1,
        1,
        ${sql.json(snapshot)},
        'Integration A',
        ${`IA-${suffix}`},
        'Integration period'
      )
    `;

    const live = structuredClone(defaultFullReportContent);
    live.summary.quarterResult = "Измененная рабочая копия";
    await sql`
      UPDATE reports
      SET content = ${sql.json(live)}
      WHERE id = ${reportId}
    `;

    const [stored] = await sql`
      SELECT content
      FROM report_versions
      WHERE report_id = ${reportId} AND version_number = 1
    `;
    expect(stored?.content.summary.quarterResult).toBe("Отправленная версия");
  });
});
