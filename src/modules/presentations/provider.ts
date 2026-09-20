import "server-only";

import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  FullReportContent,
  reportDerived,
} from "@/modules/reports/content";
import type { ReportStatus } from "@/modules/reports/domain";

export type ReportPptxExportMode = "IMMUTABLE_SNAPSHOT" | "LIVE_COPY";

export type ReportPptxPayload = {
  report: {
    reportId: string;
    productId: string;
    productName: string;
    productCode: string;
    periodLabel: string;
    status: ReportStatus;
    revision: number;
    version: number;
    exportMode: ReportPptxExportMode;
    contentHash: string;
    reportUpdatedAt: string;
    snapshotSubmittedAt: string | null;
    managementDecision: string;
    content: FullReportContent;
    derived: ReturnType<typeof reportDerived>;
  };
};

type TemplateManifestSummary = {
  manifestVersion: number;
  templateVersion: string;
  templateSha256: string;
};

export type ReportPptxResult = {
  bytes: Buffer;
  manifest: TemplateManifestSummary;
};

export interface ReportPptxProvider {
  generate(payload: ReportPptxPayload): Promise<ReportPptxResult>;
}

export class ReportPptxProviderError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ReportPptxProviderError";
  }
}

const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_OUTPUT_BYTES = 50 * 1024 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;

async function firstExistingPath(candidates: Array<string | undefined>) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    const resolved = path.resolve(candidate);
    const stat = await fs.stat(resolved).catch(() => null);
    if (stat?.isFile()) return resolved;
  }
  return null;
}

async function resolveWorkerPath() {
  const worker = await firstExistingPath([
    process.env.PPTX_EXPORT_WORKER_PATH,
    path.join(process.cwd(), "scripts", "pptx-export-worker-open.mjs"),
    path.join(process.cwd(), "web", "scripts", "pptx-export-worker-open.mjs"),
  ]);
  if (!worker) {
    throw new ReportPptxProviderError(
      "WORKER_NOT_FOUND",
      "PPTX export worker is not available. Configure PPTX_EXPORT_WORKER_PATH.",
    );
  }
  return worker;
}

async function resolveManifestPath() {
  const manifest = await firstExistingPath([
    process.env.PPTX_TEMPLATE_MANIFEST_PATH,
    path.join(
      process.cwd(),
      "server-assets",
      "pptx",
      "template-manifest.json",
    ),
    path.join(
      process.cwd(),
      "web",
      "server-assets",
      "pptx",
      "template-manifest.json",
    ),
  ]);
  if (!manifest) {
    throw new ReportPptxProviderError(
      "MANIFEST_NOT_FOUND",
      "PPTX template manifest is not available. Configure PPTX_TEMPLATE_MANIFEST_PATH.",
    );
  }
  return manifest;
}

async function resolveTemplatePath() {
  const template = await firstExistingPath([
    process.env.REPORT_PPTX_TEMPLATE_PATH,
    path.join(
      process.cwd(),
      "..",
      "references",
      "templates",
      "Отчет_по_продукту.pptx",
    ),
    path.join(
      process.cwd(),
      "references",
      "templates",
      "Отчет_по_продукту.pptx",
    ),
  ]);
  if (!template) {
    throw new ReportPptxProviderError(
      "TEMPLATE_NOT_FOUND",
      "PPTX source template is not available. Configure REPORT_PPTX_TEMPLATE_PATH.",
    );
  }
  return template;
}

async function readManifestSummary(manifestPath: string) {
  let value: unknown;
  try {
    value = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new ReportPptxProviderError(
      "INVALID_MANIFEST",
      "PPTX template manifest is not valid JSON.",
      { cause: error },
    );
  }

  if (
    !value ||
    typeof value !== "object" ||
    typeof (value as Record<string, unknown>).manifestVersion !== "number" ||
    typeof (value as Record<string, unknown>).templateVersion !== "string" ||
    typeof (value as Record<string, unknown>).templateSha256 !== "string"
  ) {
    throw new ReportPptxProviderError(
      "INVALID_MANIFEST",
      "PPTX template manifest does not contain its required identity fields.",
    );
  }

  return {
    manifestVersion: (value as Record<string, number>).manifestVersion,
    templateVersion: (value as Record<string, string>).templateVersion,
    templateSha256: (value as Record<string, string>).templateSha256,
  } satisfies TemplateManifestSummary;
}

function timeoutFromEnvironment() {
  const configured = Number.parseInt(
    process.env.PPTX_EXPORT_TIMEOUT_MS ?? "",
    10,
  );
  return Number.isFinite(configured) && configured >= 10_000
    ? configured
    : DEFAULT_TIMEOUT_MS;
}

function workerError(stderr: string, exitCode: number | null) {
  const match = stderr.match(
    /PPTX_EXPORT_ERROR:([A-Z0-9_]+):([^\r\n]*)/,
  );
  if (match) {
    return new ReportPptxProviderError(match[1], match[2]);
  }
  return new ReportPptxProviderError(
    "WORKER_FAILED",
    `PPTX export worker exited with code ${exitCode ?? "unknown"}.`,
  );
}

async function runWorker(
  workerPath: string,
  templatePath: string,
  manifestPath: string,
  payload: ReportPptxPayload,
) {
  return await new Promise<Buffer>((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        workerPath,
        "--template",
        templatePath,
        "--manifest",
        manifestPath,
      ],
      {
        cwd: process.cwd(),
        env: process.env,
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      callback();
    };

    const timer = setTimeout(() => {
      child.kill();
      finish(() =>
        reject(
          new ReportPptxProviderError(
            "WORKER_TIMEOUT",
            `PPTX export exceeded ${timeoutFromEnvironment()} ms.`,
          ),
        ),
      );
    }, timeoutFromEnvironment());

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_OUTPUT_BYTES) {
        child.kill();
        finish(() =>
          reject(
            new ReportPptxProviderError(
              "OUTPUT_TOO_LARGE",
              "PPTX export exceeded 50 MB.",
            ),
          ),
        );
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      if (stderrBytes >= MAX_STDERR_BYTES) return;
      const remaining = MAX_STDERR_BYTES - stderrBytes;
      const part = chunk.subarray(0, remaining);
      stderr.push(part);
      stderrBytes += part.length;
    });

    child.on("error", (error) => {
      finish(() =>
        reject(
          new ReportPptxProviderError(
            "WORKER_START_FAILED",
            "Could not start the PPTX export worker.",
            { cause: error },
          ),
        ),
      );
    });

    child.on("close", (exitCode) => {
      finish(() => {
        const errorOutput = Buffer.concat(stderr).toString("utf8");
        if (exitCode !== 0) {
          reject(workerError(errorOutput, exitCode));
          return;
        }
        if (!stdoutBytes) {
          reject(
            new ReportPptxProviderError(
              "EMPTY_OUTPUT",
              "PPTX export worker returned an empty file.",
            ),
          );
          return;
        }
        resolve(Buffer.concat(stdout));
      });
    });

    child.stdin.on("error", (error) => {
      finish(() =>
        reject(
          new ReportPptxProviderError(
            "WORKER_INPUT_FAILED",
            "Could not send the report snapshot to the PPTX export worker.",
            { cause: error },
          ),
        ),
      );
    });
    child.stdin.end(JSON.stringify(payload));
  });
}

export class LocalNodeReportPptxProvider implements ReportPptxProvider {
  async generate(payload: ReportPptxPayload): Promise<ReportPptxResult> {
    const [workerPath, manifestPath, templatePath] = await Promise.all([
      resolveWorkerPath(),
      resolveManifestPath(),
      resolveTemplatePath(),
    ]);
    const manifest = await readManifestSummary(manifestPath);
    const bytes = await runWorker(
      workerPath,
      templatePath,
      manifestPath,
      payload,
    );
    return { bytes, manifest };
  }
}

export function getReportPptxProvider(): ReportPptxProvider {
  return new LocalNodeReportPptxProvider();
}
