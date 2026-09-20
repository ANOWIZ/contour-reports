import "server-only";

import { and, asc, desc, eq, inArray, lte } from "drizzle-orm";

import { db } from "@/db";
import {
  products,
  reportingPeriods,
  reportReviews,
  reports,
  reportVersions,
  user,
} from "@/db/schema";
import { requireManagement, requireProductLead } from "@/modules/auth/session";
import { variancePercent } from "./domain";
import {
  measureNumber,
  parseReportContent,
  reportCompleteness,
  reportDerived,
  sumAvailableMeasures,
} from "./content";
import { aggregateQuarterlyTrends } from "./trends";

export type ManagementPortfolioFilters = {
  periodId?: string;
  status?: string;
  query?: string;
};

async function getManagementTrends(until: Date) {
  const periods = await db
    .select({
      periodId: reportingPeriods.id,
      periodLabel: reportingPeriods.label,
      year: reportingPeriods.year,
      quarter: reportingPeriods.quarter,
      endsAt: reportingPeriods.endsAt,
    })
    .from(reportingPeriods)
    .where(lte(reportingPeriods.endsAt, until))
    .orderBy(desc(reportingPeriods.endsAt))
    .limit(4);
  const periodIds = periods.map((period) => period.periodId);
  const productIds = (
    await db.select({ id: products.id }).from(products).orderBy(asc(products.name))
  ).map((product) => product.id);

  const snapshots = periodIds.length
    ? await db
        .select({
          periodId: reports.periodId,
          reportId: reports.id,
          productId: reports.productId,
          versionNumber: reportVersions.versionNumber,
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
            eq(reports.status, "PUBLISHED"),
            inArray(reports.periodId, periodIds),
          ),
        )
    : [];

  return aggregateQuarterlyTrends(
    periods.map((period) => ({
      periodId: period.periodId,
      periodLabel: period.periodLabel,
      year: period.year,
      quarter: period.quarter,
      productIds,
      snapshots: snapshots
        .filter((snapshot) => snapshot.periodId === period.periodId)
        .map((snapshot) => ({
          reportId: snapshot.reportId,
          productId: snapshot.productId,
          versionNumber: snapshot.versionNumber,
          content: parseReportContent(snapshot.content),
        })),
    })),
  );
}

export async function getManagementPortfolio(
  filters: ManagementPortfolioFilters = {},
) {
  await requireManagement();

  const periods = await db
    .select({
      id: reportingPeriods.id,
      label: reportingPeriods.label,
      isActive: reportingPeriods.isActive,
      endsAt: reportingPeriods.endsAt,
    })
    .from(reportingPeriods)
    .orderBy(desc(reportingPeriods.endsAt));
  const selectedPeriod =
    periods.find((period) => period.id === filters.periodId) ??
    periods.find((period) => period.isActive) ??
    periods[0];

  if (!selectedPeriod) {
    return {
      periodLabel: "Период не создан",
      selectedPeriodId: "",
      periods: [],
      rows: [],
      exceptions: {
        revenue: [],
        risks: [],
        decisions: [],
        systemicProblems: [],
        resourceIssues: [],
        keyDeals: [],
        nextQuarter: [],
      },
      totals: {
        revenueActual: null,
        revenuePlan: null,
        yearForecast: null,
        lostRevenue: null,
        presalesActual: null,
        moneyUnit: "млн ₽",
        vatTreatment: "INCLUDED" as const,
        moneyComparable: true,
        revenueComparable: false,
        revenueCoverage: 0,
        revenueActualCoverage: 0,
        revenuePlanCoverage: 0,
        forecastCoverage: 0,
        lostRevenueCoverage: 0,
        weightedConversion: null,
        conversionCoverage: 0,
        products: 0,
        published: 0,
        missingReports: 0,
        staleReports: 0,
        openRisks: 0,
        highRisks: 0,
        decisions: 0,
      },
      trends: aggregateQuarterlyTrends([]),
    };
  }

  const reportRows = await db
    .select({
      reportId: reports.id,
      status: reports.status,
      updatedAt: reports.updatedAt,
      content: reports.content,
      productId: products.id,
      productName: products.name,
      productCode: products.code,
      accent: products.accent,
    })
    .from(products)
    .leftJoin(
      reports,
      and(
        eq(reports.productId, products.id),
        eq(reports.periodId, selectedPeriod.id),
      ),
    )
    .orderBy(asc(products.name));

  const leads = await db
    .select({
      productId: user.productId,
      leadName: user.name,
    })
    .from(user)
    .where(eq(user.role, "PRODUCT_LEAD"));

  const rows = reportRows.map((row) => {
    const content = parseReportContent(row.content);
    const derived = reportDerived(content);
    const revenueActual = measureNumber(
      content.commercial.revenue.quarterActual,
    );
    const revenuePlan = measureNumber(content.commercial.revenue.quarterPlan);
    const completeness = reportCompleteness(content);
    const openRisks = content.operations.risks.filter(
      (risk) => risk.status !== "CLOSED",
    ).length;

    return {
      ...row,
      hasReport: Boolean(row.reportId),
      isStale:
        row.updatedAt === null ||
        Date.now() - row.updatedAt.getTime() > 14 * 24 * 60 * 60 * 1000,
      periodLabel: selectedPeriod.label,
      content,
      derived,
      leadName:
        leads.find((lead) => lead.productId === row.productId)?.leadName ??
        "Не назначен",
      revenueActual,
      revenuePlan,
      revenueVariance:
        revenueActual !== null && revenuePlan !== null
          ? variancePercent(revenueActual, revenuePlan)
          : null,
      presalesActual: measureNumber(content.commercial.presales.actual),
      yearForecast: measureNumber(content.commercial.revenue.yearForecast),
      forecastVariance:
        derived.yearForecastCompletion === null
          ? null
          : derived.yearForecastCompletion - 100,
      leadToWon: derived.funnelConversions.leadToWon,
      lostRevenue: derived.lostRevenue,
      openRisks,
      completeness: completeness.percent,
      decisions: content.decisions.length,
      mainProblem: content.summary.mainProblems,
      mainRisk: content.summary.mainRisk,
      requestedAttention: content.summary.requestedAttention,
      moneyUnit: content.context.moneyUnit,
      vatTreatment: content.context.vatTreatment,
    };
  });

  const query = filters.query?.trim().toLocaleLowerCase("ru") ?? "";
  const filteredRows = rows.filter((row) => {
    const matchesStatus =
      !filters.status ||
      filters.status === "ALL" ||
      (filters.status === "MISSING"
        ? !row.hasReport
        : row.status === filters.status);
    const matchesQuery =
      !query ||
      row.productName.toLocaleLowerCase("ru").includes(query) ||
      row.productCode.toLocaleLowerCase("ru").includes(query) ||
      row.leadName.toLocaleLowerCase("ru").includes(query);
    return matchesStatus && matchesQuery;
  });

  const revenueActualAggregate = sumAvailableMeasures(
    filteredRows.map((row) => row.content.commercial.revenue.quarterActual),
  );
  const revenuePlanAggregate = sumAvailableMeasures(
    filteredRows.map((row) => row.content.commercial.revenue.quarterPlan),
  );
  const yearForecastAggregate = sumAvailableMeasures(
    filteredRows.map((row) => row.content.commercial.revenue.yearForecast),
  );
  const presalesAggregate = sumAvailableMeasures(
    filteredRows.map((row) => row.content.commercial.presales.actual),
  );
  const lostRevenueRows = filteredRows.filter(
    (row) => row.lostRevenue !== null,
  );
  const lostRevenue = lostRevenueRows.length
    ? lostRevenueRows.reduce((sum, row) => sum + row.lostRevenue!, 0)
    : null;
  const conversionRows = filteredRows.filter(
    (row) =>
      row.derived.funnelStageTotals.leads !== null &&
      row.derived.funnelStageTotals.won !== null,
  );
  const totalLeads = conversionRows.reduce(
    (sum, row) => sum + row.derived.funnelStageTotals.leads!,
    0,
  );
  const totalWon = conversionRows.reduce(
    (sum, row) => sum + row.derived.funnelStageTotals.won!,
    0,
  );
  const moneyModes = [
    ...new Set(
      filteredRows
        .filter((row) => row.hasReport)
        .map((row) => `${row.moneyUnit}|${row.vatTreatment}`),
    ),
  ];
  const moneyComparable = moneyModes.length <= 1;
  const revenueActualProducts = new Set(
    filteredRows
      .filter((row) => row.revenueActual !== null)
      .map((row) => row.productId),
  );
  const revenuePlanProducts = new Set(
    filteredRows
      .filter((row) => row.revenuePlan !== null)
      .map((row) => row.productId),
  );
  const revenueCohortComparable =
    revenueActualProducts.size > 0 &&
    revenueActualProducts.size === revenuePlanProducts.size &&
    [...revenueActualProducts].every((productId) =>
      revenuePlanProducts.has(productId),
    );
  const moneyUnit = filteredRows.find((row) => row.hasReport)?.moneyUnit ?? "млн ₽";
  const vatTreatment =
    filteredRows.find((row) => row.hasReport)?.vatTreatment ?? "INCLUDED";

  const revenueExceptions = filteredRows
    .filter(
      (row) =>
        row.hasReport &&
        ((row.revenueVariance !== null && row.revenueVariance < 0) ||
          (row.forecastVariance !== null && row.forecastVariance < 0)),
    )
    .map((row) => ({
      reportId: row.reportId!,
      productName: row.productName,
      productCode: row.productCode,
      revenueVariance: row.revenueVariance,
      forecastVariance: row.forecastVariance,
      varianceAmount: row.derived.quarterVarianceAmount,
      reason: row.content.commercial.revenue.varianceReason,
      action: row.content.commercial.revenue.correctiveAction,
      actionOwner: row.content.commercial.revenue.actionOwner,
      actionDueDate: row.content.commercial.revenue.actionDueDate,
      actionStatus: row.content.commercial.revenue.actionStatus,
      moneyUnit: row.moneyUnit,
    }));

  const riskItems = filteredRows.flatMap((row) =>
    row.hasReport
      ? row.content.operations.risks
          .filter((risk) => risk.status !== "CLOSED")
          .map((risk) => ({
            reportId: row.reportId!,
            productName: row.productName,
            productCode: row.productCode,
            ...risk,
          }))
      : [],
  );
  const decisionItems = filteredRows.flatMap((row) =>
    row.hasReport
      ? row.content.decisions.map((decision) => ({
          reportId: row.reportId!,
          productName: row.productName,
          productCode: row.productCode,
          ...decision,
        }))
      : [],
  );
  const resourceIssues = filteredRows.flatMap((row) =>
    row.hasReport
      ? row.content.operations.resources
          .filter((resource) => resource.issue.trim())
          .map((resource) => ({
            reportId: row.reportId!,
            productName: row.productName,
            role: resource.role,
            issue: resource.issue,
            load: measureNumber(resource.load),
          }))
      : [],
  );
  const keyDeals = filteredRows.flatMap((row) =>
    row.hasReport
      ? row.content.commercial.deals.map((deal) => ({
          reportId: row.reportId!,
          productName: row.productName,
          moneyUnit: row.moneyUnit,
          ...deal,
        }))
      : [],
  );
  const nextQuarter = filteredRows.flatMap((row) =>
    row.hasReport
      ? row.content.nextQuarter.map((item) => ({
          reportId: row.reportId!,
          productName: row.productName,
          ...item,
        }))
      : [],
  );
  const systemicMap = new Map<
    string,
    { problem: string; products: Set<string>; count: number }
  >();
  for (const row of filteredRows) {
    for (const deal of row.content.commercial.lostDeals) {
      const problem = deal.systemicProblem.trim();
      if (!problem) continue;
      const item = systemicMap.get(problem) ?? {
        problem,
        products: new Set<string>(),
        count: 0,
      };
      item.products.add(row.productName);
      item.count += 1;
      systemicMap.set(problem, item);
    }
  }

  return {
    periodLabel: selectedPeriod.label,
    selectedPeriodId: selectedPeriod.id,
    periods: periods.map(({ id, label }) => ({ id, label })),
    rows: filteredRows,
    exceptions: {
      revenue: revenueExceptions,
      risks: riskItems.sort(
        (left, right) =>
          ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[left.probability] -
          ({ HIGH: 0, MEDIUM: 1, LOW: 2 })[right.probability],
      ),
      decisions: decisionItems,
      systemicProblems: [...systemicMap.values()]
        .map((item) => ({
          problem: item.problem,
          products: [...item.products],
          count: item.count,
        }))
        .sort((left, right) => right.count - left.count),
      resourceIssues,
      keyDeals,
      nextQuarter,
    },
    totals: {
      revenueActual: moneyComparable ? revenueActualAggregate.value : null,
      revenuePlan: moneyComparable ? revenuePlanAggregate.value : null,
      yearForecast: moneyComparable ? yearForecastAggregate.value : null,
      lostRevenue: moneyComparable ? lostRevenue : null,
      presalesActual: moneyComparable ? presalesAggregate.value : null,
      moneyUnit,
      vatTreatment,
      moneyComparable,
      revenueComparable: moneyComparable && revenueCohortComparable,
      revenueCoverage: filteredRows.filter(
        (row) => row.revenueActual !== null && row.revenuePlan !== null,
      ).length,
      revenueActualCoverage: revenueActualAggregate.valueCount,
      revenuePlanCoverage: revenuePlanAggregate.valueCount,
      forecastCoverage: yearForecastAggregate.valueCount,
      lostRevenueCoverage: lostRevenueRows.length,
      weightedConversion:
        totalLeads > 0 ? (totalWon / totalLeads) * 100 : null,
      conversionCoverage: conversionRows.length,
      products: filteredRows.length,
      published: filteredRows.filter((row) => row.status === "PUBLISHED").length,
      missingReports: filteredRows.filter((row) => !row.hasReport).length,
      staleReports: filteredRows.filter((row) => row.hasReport && row.isStale)
        .length,
      openRisks: riskItems.length,
      highRisks: riskItems.filter((risk) => risk.probability === "HIGH").length,
      decisions: decisionItems.length,
    },
    trends: await getManagementTrends(selectedPeriod.endsAt),
  };
}

async function getReportTimeline(reportId: string) {
  const [versions, reviews] = await Promise.all([
    db
      .select({
        id: reportVersions.id,
        versionNumber: reportVersions.versionNumber,
        reportRevision: reportVersions.reportRevision,
        completeness: reportVersions.completeness,
        contentHash: reportVersions.contentHash,
        submittedAt: reportVersions.submittedAt,
        actorName: user.name,
      })
      .from(reportVersions)
      .leftJoin(user, eq(reportVersions.submittedById, user.id))
      .where(eq(reportVersions.reportId, reportId))
      .orderBy(desc(reportVersions.versionNumber)),
    db
      .select({
        id: reportReviews.id,
        versionNumber: reportReviews.versionNumber,
        fromStatus: reportReviews.fromStatus,
        toStatus: reportReviews.toStatus,
        comment: reportReviews.comment,
        createdAt: reportReviews.createdAt,
        actorName: user.name,
      })
      .from(reportReviews)
      .leftJoin(user, eq(reportReviews.actorId, user.id))
      .where(eq(reportReviews.reportId, reportId))
      .orderBy(desc(reportReviews.createdAt)),
  ]);

  return { versions, reviews };
}

export async function getLeadReport() {
  const session = await requireProductLead();
  const productId = session.user.productId!;

  const [product] = await db
    .select({
      id: products.id,
      name: products.name,
      code: products.code,
      accent: products.accent,
    })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!product) return null;

  const [activePeriod] = await db
    .select({
      id: reportingPeriods.id,
      label: reportingPeriods.label,
      startsAt: reportingPeriods.startsAt,
      endsAt: reportingPeriods.endsAt,
    })
    .from(reportingPeriods)
    .where(eq(reportingPeriods.isActive, true))
    .orderBy(desc(reportingPeriods.endsAt))
    .limit(1);

  const quarterlyReports = await db
    .select({
      id: reports.id,
      status: reports.status,
      version: reports.version,
      periodLabel: reportingPeriods.label,
      periodEndsAt: reportingPeriods.endsAt,
      updatedAt: reports.updatedAt,
    })
    .from(reports)
    .innerJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.id))
    .where(eq(reports.productId, productId))
    .orderBy(desc(reportingPeriods.endsAt));

  if (!activePeriod) {
    return {
      product,
      activePeriod: null,
      report: null,
      quarterlyReports,
      timeline: { versions: [], reviews: [] },
    };
  }

  const [report] = await db
    .select({
      id: reports.id,
      status: reports.status,
      revision: reports.revision,
      version: reports.version,
      copiedFromReportId: reports.copiedFromReportId,
      executiveSummary: reports.executiveSummary,
      achievements: reports.achievements,
      nextSteps: reports.nextSteps,
      managementDecision: reports.managementDecision,
      content: reports.content,
      updatedAt: reports.updatedAt,
      productId: products.id,
      productName: products.name,
      productCode: products.code,
      accent: products.accent,
      periodLabel: reportingPeriods.label,
      periodEndsAt: reportingPeriods.endsAt,
    })
    .from(reports)
    .innerJoin(products, eq(reports.productId, products.id))
    .innerJoin(reportingPeriods, eq(reports.periodId, reportingPeriods.id))
    .where(
      and(
        eq(reports.productId, productId),
        eq(reports.periodId, activePeriod.id),
      ),
    )
    .limit(1);

  if (!report) {
    return {
      product,
      activePeriod,
      report: null,
      quarterlyReports,
      timeline: { versions: [], reviews: [] },
    };
  }

  return {
    product,
    activePeriod,
    report: { ...report, content: parseReportContent(report.content) },
    quarterlyReports,
    timeline: await getReportTimeline(report.id),
  };
}

export async function getManagementReportDetail(reportId: string) {
  await requireManagement();

  const [report] = await db
    .select({
      id: reports.id,
      status: reports.status,
      revision: reports.revision,
      version: reports.version,
      managementDecision: reports.managementDecision,
      content: reports.content,
      snapshotContent: reportVersions.content,
      updatedAt: reports.updatedAt,
      productName: products.name,
      productCode: products.code,
      accent: products.accent,
      periodLabel: reportingPeriods.label,
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

  if (!report) return null;
  const content = parseReportContent(
    (report.status === "SUBMITTED" || report.status === "PUBLISHED") &&
      report.snapshotContent
      ? report.snapshotContent
      : report.content,
  );
  const { snapshotContent: _snapshotContent, ...reportData } = report;
  void _snapshotContent;

  return {
    report: { ...reportData, content },
    derived: reportDerived(content),
    completeness: reportCompleteness(content),
    timeline: await getReportTimeline(report.id),
  };
}

export async function assertOwnedEditableReport(reportId: string, productId: string) {
  const [report] = await db
    .select({ id: reports.id, status: reports.status, content: reports.content })
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.productId, productId)))
    .limit(1);

  return report ?? null;
}
