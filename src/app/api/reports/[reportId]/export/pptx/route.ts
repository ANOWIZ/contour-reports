import { createHash } from "node:crypto";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  products,
  reportingPeriods,
  reports,
  reportVersions,
} from "@/db/schema";
import { getAppSession } from "@/modules/auth/session";
import {
  fullReportContentSchema,
  reportDerived,
} from "@/modules/reports/content";
import { reportContentHash } from "@/modules/reports/integrity";
import {
  getReportPptxProvider,
  ReportPptxProviderError,
  type ReportPptxExportMode,
} from "@/modules/presentations/provider";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PPTX_MIME =
  "application/vnd.openxmlformats-officedocument.presentationml.presentation";

function safeFilenamePart(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return normalized.slice(0, 80) || "report";
}

function contentDisposition(productCode: string, periodLabel: string) {
  const asciiName = `product-report-${safeFilenamePart(productCode)}-${safeFilenamePart(periodLabel)}.pptx`
    .replace(/[^\x20-\x7E]/g, "-")
    .replace(/-+/g, "-");
  const unicodeName = `Отчет_${productCode}_${periodLabel}.pptx`;
  return `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(unicodeName)}`;
}

function errorStatus(code: string) {
  if (
    code === "WORKER_NOT_FOUND" ||
    code === "WORKER_START_FAILED"
  ) {
    return 503;
  }
  if (code === "WORKER_TIMEOUT") return 504;
  return 500;
}

function publicErrorMessage(code: string) {
  if (code === "WORKER_TIMEOUT") {
    return "Экспорт занял слишком много времени. Повторите попытку.";
  }
  return "Не удалось сформировать презентацию.";
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  const session = await getAppSession();
  if (!session) {
    return Response.json({ error: "Требуется вход в систему." }, { status: 401 });
  }

  const { reportId } = await context.params;
  const [row] = await db
    .select({
      reportId: reports.id,
      productId: reports.productId,
      status: reports.status,
      revision: reports.revision,
      version: reports.version,
      liveContent: reports.content,
      managementDecision: reports.managementDecision,
      reportUpdatedAt: reports.updatedAt,
      reportSubmittedAt: reports.submittedAt,
      productName: products.name,
      productCode: products.code,
      periodLabel: reportingPeriods.label,
      snapshotContent: reportVersions.content,
      snapshotHash: reportVersions.contentHash,
      snapshotRevision: reportVersions.reportRevision,
      snapshotProductName: reportVersions.productName,
      snapshotProductCode: reportVersions.productCode,
      snapshotPeriodLabel: reportVersions.periodLabel,
      snapshotSubmittedAt: reportVersions.submittedAt,
    })
    .from(reports)
    .innerJoin(products, eq(reports.productId, products.id))
    .innerJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.id))
    .leftJoin(
      reportVersions,
      and(
        eq(reportVersions.reportId, reports.id),
        eq(reportVersions.versionNumber, reports.version),
      ),
    )
    .where(eq(reports.id, reportId))
    .limit(1);

  if (
    !row ||
    (session.user.role === "PRODUCT_LEAD" &&
      session.user.productId !== row.productId)
  ) {
    return Response.json({ error: "Отчет не найден." }, { status: 404 });
  }

  const immutable =
    row.status === "SUBMITTED" || row.status === "PUBLISHED";
  if (immutable && !row.snapshotContent) {
    return Response.json(
      {
        error:
          "Для отправленной версии отсутствует неизменяемый снимок. Экспорт остановлен, чтобы не подменить отчет актуальными данными.",
      },
      { status: 409 },
    );
  }
  if (immutable && !row.snapshotHash) {
    return Response.json(
      {
        error:
          "Для снимка отчета отсутствует контрольная сумма. Экспорт остановлен.",
      },
      { status: 409 },
    );
  }

  const selectedContent = immutable ? row.snapshotContent : row.liveContent;
  const parsed = fullReportContentSchema.safeParse(selectedContent);
  if (!parsed.success) {
    return Response.json(
      { error: "Содержимое отчета не прошло проверку структуры." },
      { status: 422 },
    );
  }

  const calculatedContentHash = reportContentHash(parsed.data);
  if (immutable && row.snapshotHash !== calculatedContentHash) {
    return Response.json(
      {
        error:
          "Контрольная сумма снимка отчета не совпала. Экспорт остановлен.",
      },
      { status: 409 },
    );
  }

  const exportMode: ReportPptxExportMode = immutable
    ? "IMMUTABLE_SNAPSHOT"
    : "LIVE_COPY";
  const productName =
    immutable && row.snapshotProductName
      ? row.snapshotProductName
      : row.productName;
  const productCode =
    immutable && row.snapshotProductCode
      ? row.snapshotProductCode
      : row.productCode;
  const periodLabel =
    immutable && row.snapshotPeriodLabel
      ? row.snapshotPeriodLabel
      : row.periodLabel;

  try {
    const result = await getReportPptxProvider().generate({
      report: {
        reportId: row.reportId,
        productId: row.productId,
        productName,
        productCode,
        periodLabel,
        status: row.status,
        revision:
          immutable && row.snapshotRevision !== null
            ? row.snapshotRevision
            : row.revision,
        version: row.version,
        exportMode,
        contentHash: calculatedContentHash,
        reportUpdatedAt: row.reportUpdatedAt.toISOString(),
        snapshotSubmittedAt:
          immutable && row.snapshotSubmittedAt
            ? row.snapshotSubmittedAt.toISOString()
            : row.reportSubmittedAt?.toISOString() ?? null,
        managementDecision: row.managementDecision,
        content: parsed.data,
        derived: reportDerived(parsed.data),
      },
    });
    const etag = createHash("sha256")
      .update(calculatedContentHash)
      .update(result.manifest.templateSha256)
      .update(String(result.manifest.manifestVersion))
      .digest("hex");
    const timestamp =
      immutable && row.snapshotSubmittedAt
        ? row.snapshotSubmittedAt
        : row.reportUpdatedAt;

    return new Response(new Uint8Array(result.bytes), {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition": contentDisposition(productCode, periodLabel),
        "Content-Length": String(result.bytes.length),
        "Content-Type": PPTX_MIME,
        ETag: `"${etag}"`,
        "Last-Modified": timestamp.toUTCString(),
        "X-Report-Content-Sha256": calculatedContentHash,
        "X-Report-Export-Mode": exportMode,
        "X-Report-Version": String(row.version),
        "X-Template-Version": result.manifest.templateVersion,
      },
    });
  } catch (error) {
    if (error instanceof ReportPptxProviderError) {
      console.error("PPTX export failed", {
        code: error.code,
        reportId: row.reportId,
      });
      return Response.json(
        {
          error: publicErrorMessage(error.code),
          code: error.code,
        },
        { status: errorStatus(error.code) },
      );
    }
    console.error("PPTX export failed", {
      code: "UNEXPECTED_EXPORT_ERROR",
      reportId: row.reportId,
    });
    return Response.json(
      { error: "Не удалось сформировать презентацию." },
      { status: 500 },
    );
  }
}
