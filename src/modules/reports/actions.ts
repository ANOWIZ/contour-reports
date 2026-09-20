"use server";

import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { db } from "@/db";
import {
  metricSnapshots,
  products,
  reportingPeriods,
  reportReviews,
  reports,
  reportVersions,
} from "@/db/schema";
import { requireManagement, requireProductLead } from "@/modules/auth/session";
import {
  defaultFullReportContent,
  fullReportContentSchema,
  measureNumber,
  parseReportContent,
  reportCompleteness,
  type FullReportContent,
} from "./content";
import { carryForwardReportContent } from "./carry-forward";
import type { ReportStatus } from "./domain";
import { reportContentHash, reportProjection } from "./integrity";

export type SaveReportState = {
  ok: boolean;
  message: string;
  revision?: number;
  savedAt?: string;
  status?: ReportStatus;
  conflict?: boolean;
};

type ReportTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const fullReportPayloadSchema = z.object({
  reportId: z.string().min(1),
  content: z.string().max(500_000),
  expectedRevision: z.coerce.number().int().nonnegative(),
  intent: z.enum(["SAVE", "SUBMIT"]).default("SAVE"),
});

async function syncMetricSnapshots(
  tx: ReportTransaction,
  reportId: string,
  content: FullReportContent,
) {
  const revenue = content.commercial.revenue;
  const metricUpdates = [
    {
      key: "revenue",
      group: "finance",
      label: "Выручка",
      unit: content.context.moneyUnit,
      plan: measureNumber(revenue.quarterPlan),
      actual: measureNumber(revenue.quarterActual),
      sortOrder: 1,
    },
    {
      key: "presales",
      group: "sales",
      label: "Пресейлы",
      unit: "шт.",
      plan: measureNumber(content.commercial.presales.plan),
      actual: measureNumber(content.commercial.presales.actual),
      sortOrder: 2,
    },
    {
      key: "mql",
      group: "marketing",
      label: "MQL",
      unit: "шт.",
      plan: measureNumber(content.marketing.mqlPlan),
      actual: measureNumber(content.marketing.mqlActual),
      sortOrder: 3,
    },
  ];

  for (const metric of metricUpdates) {
    if (metric.plan === null || metric.actual === null) {
      await tx
        .delete(metricSnapshots)
        .where(
          and(
            eq(metricSnapshots.reportId, reportId),
            eq(metricSnapshots.key, metric.key),
          ),
        );
      continue;
    }

    await tx
      .insert(metricSnapshots)
      .values({
        reportId,
        group: metric.group,
        key: metric.key,
        label: metric.label,
        unit: metric.unit,
        plan: metric.plan,
        actual: metric.actual,
        previous: 0,
        trend: "FLAT",
        monthly: [],
        sortOrder: metric.sortOrder,
      })
      .onConflictDoUpdate({
        target: [metricSnapshots.reportId, metricSnapshots.key],
        set: {
          label: metric.label,
          unit: metric.unit,
          plan: metric.plan,
          actual: metric.actual,
          updatedAt: new Date(),
        },
      });
  }
}

export async function saveFullReport(
  _previousState: SaveReportState,
  formData: FormData,
): Promise<SaveReportState> {
  const session = await requireProductLead();
  const payload = fullReportPayloadSchema.safeParse(Object.fromEntries(formData));

  if (!payload.success) {
    return { ok: false, message: "Не удалось прочитать данные отчета." };
  }

  let content: FullReportContent;
  try {
    content = fullReportContentSchema.parse(JSON.parse(payload.data.content));
  } catch {
    return {
      ok: false,
      message: "В отчете есть некорректные или незаполненные значения.",
    };
  }

  const completeness = reportCompleteness(content);
  if (payload.data.intent === "SUBMIT" && completeness.percent < 100) {
    return {
      ok: false,
      message: `Перед отправкой заполните все разделы: сейчас ${completeness.percent}%.`,
    };
  }

  const now = new Date();
  const projection = reportProjection(content);
  const updatedReport = await db.transaction(async (tx) => {
    const guardedWhere = and(
      eq(reports.id, payload.data.reportId),
      eq(reports.productId, session.user.productId!),
      eq(reports.revision, payload.data.expectedRevision),
      or(eq(reports.status, "DRAFT"), eq(reports.status, "RETURNED")),
    );
    const commonUpdate = {
      content,
      ...projection,
      revision: sql`${reports.revision} + 1`,
      updatedAt: now,
    };

    const [updated] =
      payload.data.intent === "SUBMIT"
        ? await tx
            .update(reports)
            .set({
              ...commonUpdate,
              status: "SUBMITTED",
              version: sql`${reports.version} + 1`,
              submittedAt: now,
            })
            .where(guardedWhere)
            .returning({
              id: reports.id,
              revision: reports.revision,
              version: reports.version,
            })
        : await tx
            .update(reports)
            .set(commonUpdate)
            .where(guardedWhere)
            .returning({
              id: reports.id,
              revision: reports.revision,
              version: reports.version,
            });

    if (!updated) return null;
    await syncMetricSnapshots(tx, updated.id, content);

    if (payload.data.intent === "SUBMIT") {
      const [snapshotContext] = await tx
        .select({
          productName: products.name,
          productCode: products.code,
          periodLabel: reportingPeriods.label,
        })
        .from(reports)
        .innerJoin(products, eq(reports.productId, products.id))
        .innerJoin(
          reportingPeriods,
          eq(reports.periodId, reportingPeriods.id),
        )
        .where(eq(reports.id, updated.id))
        .limit(1);

      if (!snapshotContext) {
        throw new Error("Не удалось определить продукт и период отчета.");
      }

      await tx.insert(reportVersions).values({
        reportId: updated.id,
        versionNumber: updated.version,
        reportRevision: updated.revision,
        content,
        contentHash: reportContentHash(content),
        completeness: completeness.percent,
        productName: snapshotContext.productName,
        productCode: snapshotContext.productCode,
        periodLabel: snapshotContext.periodLabel,
        submittedById: session.user.id,
        submittedAt: now,
      });
    }

    return updated;
  });

  if (!updatedReport) {
    return {
      ok: false,
      conflict: true,
      message:
        "Отчет изменился в другой вкладке или уже отправлен. Обновите страницу.",
    };
  }

  revalidatePath("/my-report");
  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${updatedReport.id}`);
  return {
    ok: true,
    revision: updatedReport.revision,
    savedAt: now.toISOString(),
    status:
      payload.data.intent === "SUBMIT" ? "SUBMITTED" : undefined,
    message:
      payload.data.intent === "SUBMIT"
        ? `Версия ${updatedReport.version} отправлена на проверку.`
        : "Изменения сохранены.",
  };
}

export async function reviewReport(formData: FormData) {
  const session = await requireManagement();
  const parsed = z
    .object({
      reportId: z.string().min(1),
      decision: z.enum(["RETURNED", "PUBLISHED"]),
      comment: z.string().trim().min(1).max(1000),
    })
    .safeParse(Object.fromEntries(formData));
  if (!parsed.success) return;

  await db.transaction(async (tx) => {
    const [candidate] = await tx
      .select({
        id: reports.id,
        revision: reports.revision,
        version: reports.version,
        liveContent: reports.content,
        snapshotContent: reportVersions.content,
      })
      .from(reports)
      .leftJoin(
        reportVersions,
        and(
          eq(reportVersions.reportId, reports.id),
          eq(reportVersions.versionNumber, reports.version),
        ),
      )
      .where(
        and(
          eq(reports.id, parsed.data.reportId),
          eq(reports.status, "SUBMITTED"),
        ),
      )
      .limit(1);
    if (!candidate) return;

    const reviewedContent = parseReportContent(
      candidate.snapshotContent ?? candidate.liveContent,
    );
    if (
      parsed.data.decision === "PUBLISHED" &&
      reportCompleteness(reviewedContent).percent < 100
    ) {
      return;
    }

    const decidedAt = new Date();
    const [updated] = await tx
      .update(reports)
      .set({
        status: parsed.data.decision,
        managementDecision: parsed.data.comment,
        revision: sql`${reports.revision} + 1`,
        publishedAt:
          parsed.data.decision === "PUBLISHED" ? decidedAt : null,
        updatedAt: decidedAt,
      })
      .where(
        and(
          eq(reports.id, candidate.id),
          eq(reports.status, "SUBMITTED"),
          eq(reports.revision, candidate.revision),
        ),
      )
      .returning({ id: reports.id });
    if (!updated) return;

    await tx.insert(reportReviews).values({
      reportId: candidate.id,
      versionNumber: candidate.version,
      fromStatus: "SUBMITTED",
      toStatus: parsed.data.decision,
      comment: parsed.data.comment,
      actorId: session.user.id,
      createdAt: decidedAt,
    });
  });

  revalidatePath("/portfolio");
  revalidatePath(`/portfolio/${parsed.data.reportId}`);
  revalidatePath("/my-report");
}

export async function createQuarterReport(formData: FormData) {
  const session = await requireProductLead();
  const productId = session.user.productId!;
  const copyPrevious = formData.get("copyPrevious") === "true";

  const reportId = await db.transaction(async (tx) => {
    const [activePeriod] = await tx
      .select({
        id: reportingPeriods.id,
        startsAt: reportingPeriods.startsAt,
      })
      .from(reportingPeriods)
      .where(eq(reportingPeriods.isActive, true))
      .orderBy(desc(reportingPeriods.endsAt))
      .limit(1);

    if (!activePeriod) {
      throw new Error("Активный отчетный период не найден.");
    }

    const [existing] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.productId, productId),
          eq(reports.periodId, activePeriod.id),
        ),
      )
      .limit(1);
    if (existing) return existing.id;

    let content = structuredClone(defaultFullReportContent);
    let copiedFromReportId: string | null = null;

    if (copyPrevious) {
      const [previousPeriod] = await tx
        .select({
          id: reportingPeriods.id,
          label: reportingPeriods.label,
        })
        .from(reportingPeriods)
        .where(lt(reportingPeriods.endsAt, activePeriod.startsAt))
        .orderBy(desc(reportingPeriods.endsAt))
        .limit(1);

      if (previousPeriod) {
        const [source] = await tx
          .select({
            reportId: reports.id,
            content: reportVersions.content,
          })
          .from(reports)
          .innerJoin(
            reportVersions,
            and(
              eq(reportVersions.reportId, reports.id),
              eq(reportVersions.versionNumber, reports.version),
            ),
          )
          .where(
            and(
              eq(reports.productId, productId),
              eq(reports.periodId, previousPeriod.id),
              eq(reports.status, "PUBLISHED"),
            ),
          )
          .limit(1);

        if (source) {
          copiedFromReportId = source.reportId;
          content = carryForwardReportContent(source.content, {
            sourceReportId: source.reportId,
            sourcePeriodLabel: previousPeriod.label,
            copiedAt: new Date(),
          });
        }
      }
    }

    const [created] = await tx
      .insert(reports)
      .values({
        productId,
        periodId: activePeriod.id,
        copiedFromReportId,
        content,
        ...reportProjection(content),
      })
      .onConflictDoNothing({
        target: [reports.productId, reports.periodId],
      })
      .returning({ id: reports.id });
    if (created) return created.id;

    const [raced] = await tx
      .select({ id: reports.id })
      .from(reports)
      .where(
        and(
          eq(reports.productId, productId),
          eq(reports.periodId, activePeriod.id),
        ),
      )
      .limit(1);
    if (!raced) {
      throw new Error("Не удалось создать отчет.");
    }
    return raced.id;
  });

  revalidatePath("/my-report");
  redirect(`/my-report?created=${reportId}`);
}
