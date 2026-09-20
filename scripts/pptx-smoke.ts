import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import postgres from "postgres";

import {
  parseReportContent,
  reportDerived,
} from "../src/modules/reports/content";
import { reportContentHash } from "../src/modules/reports/integrity";

async function loadLocalEnvironment() {
  const text = await fs.readFile(path.resolve(".env.local"), "utf8");
  for (const line of text.split(/\r?\n/)) {
    const normalized = line.trim();
    if (!normalized || normalized.startsWith("#")) continue;
    const separator = normalized.indexOf("=");
    if (separator <= 0) continue;
    const key = normalized.slice(0, separator);
    if (process.env[key] !== undefined) continue;
    process.env[key] = normalized.slice(separator + 1);
  }
}

function runWorker(payload: unknown) {
  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        path.resolve("scripts/pptx-export-worker-open.mjs"),
        "--template",
        path.resolve("../references/templates/Отчет_по_продукту.pptx"),
        "--manifest",
        path.resolve("server-assets/pptx/template-manifest.json"),
      ],
      {
        cwd: process.cwd(),
        env: { ...process.env, PPTX_EXPORT_DEBUG: "1" },
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
    child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8")));
        return;
      }
      resolve(Buffer.concat(stdout));
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

async function main() {
  await loadLocalEnvironment();
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured.");
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  try {
    const [row] = await sql<{
      reportId: string;
      productId: string;
      productName: string;
      productCode: string;
      periodLabel: string;
      status: "DRAFT" | "SUBMITTED" | "RETURNED" | "PUBLISHED";
      revision: number;
      version: number;
      content: unknown;
      updatedAt: Date;
      managementDecision: string;
    }[]>`
      select
        r.id as "reportId",
        r.product_id as "productId",
        p.name as "productName",
        p.code as "productCode",
        rp.label as "periodLabel",
        r.status,
        r.revision,
        r.version,
        r.content,
        r.updated_at as "updatedAt",
        r.management_decision as "managementDecision"
      from reports r
      join products p on p.id = r.product_id
      join reporting_periods rp on rp.id = r.period_id
      order by p.code
      limit 1
    `;
    if (!row) throw new Error("No report is available for the PPTX smoke test.");

    const content = parseReportContent(row.content);
    const payload = {
      report: {
        reportId: row.reportId,
        productId: row.productId,
        productName: row.productName,
        productCode: row.productCode,
        periodLabel: row.periodLabel,
        status: row.status,
        revision: row.revision,
        version: row.version,
        exportMode: "LIVE_COPY",
        contentHash: reportContentHash(content),
        reportUpdatedAt: row.updatedAt.toISOString(),
        snapshotSubmittedAt: null,
        managementDecision: row.managementDecision,
        content,
        derived: reportDerived(content),
      },
    };

    const bytes = await runWorker(payload);
    const outputPath = path.resolve(
      process.argv[2] ?? path.join(process.cwd(), "local-pptx-smoke.pptx"),
    );
    await fs.writeFile(outputPath, bytes);
    process.stdout.write(JSON.stringify({ outputPath, bytes: bytes.length }));
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
