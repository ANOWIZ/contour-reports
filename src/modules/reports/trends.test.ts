import { describe, expect, it } from "vitest";

import {
  defaultFullReportContent,
  missingMeasure,
  notApplicableMeasure,
  valueMeasure,
  type FullReportContent,
} from "./content";
import {
  aggregateQuarterlyTrends,
  type PublishedQuarterTrendInput,
  type PublishedReportTrendSnapshot,
} from "./trends";

function content(
  configure: (report: FullReportContent) => void = () => undefined,
) {
  const report = structuredClone(defaultFullReportContent);
  configure(report);
  return report;
}

function snapshot(
  productId: string,
  reportContent: FullReportContent,
  versionNumber = 1,
): PublishedReportTrendSnapshot {
  return {
    reportId: `${productId}-report`,
    productId,
    versionNumber,
    content: reportContent,
  };
}

function quarter(
  year: number,
  quarterNumber: number,
  snapshots: PublishedReportTrendSnapshot[],
  productIds = snapshots.map((item) => item.productId),
): PublishedQuarterTrendInput {
  return {
    periodId: `${year}-Q${quarterNumber}`,
    periodLabel: `${quarterNumber} квартал ${year}`,
    year,
    quarter: quarterNumber,
    productIds,
    snapshots,
  };
}

describe("quarterly portfolio trends", () => {
  it("aggregates revenue, weighted MQL to SQL, open risks and coverage", () => {
    const first = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(100, "ERP");
      report.commercial.revenue.quarterPlan = valueMeasure(120, "План");
      report.marketing.mqlActual = valueMeasure(100, "CRM");
      report.marketing.sqlActual = valueMeasure(50, "CRM");
      report.operations.risks = [
        {
          title: "Высокий риск",
          probability: "HIGH",
          impact: "Срок",
          mitigation: "План",
          owner: "Лид",
          status: "OPEN",
        },
        {
          title: "Средний риск",
          probability: "MEDIUM",
          impact: "Выручка",
          mitigation: "План",
          owner: "Лид",
          status: "WATCH",
        },
        {
          title: "Закрытый риск",
          probability: "HIGH",
          impact: "Нет",
          mitigation: "Выполнено",
          owner: "Лид",
          status: "CLOSED",
        },
      ];
    });
    const second = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(200, "ERP");
      report.commercial.revenue.quarterPlan = valueMeasure(180, "План");
      report.marketing.mqlActual = valueMeasure(300, "CRM");
      report.marketing.sqlActual = valueMeasure(60, "CRM");
      report.collectionStates.risks = "ZERO";
    });

    const result = aggregateQuarterlyTrends([
      quarter(2026, 2, [
        snapshot("alpha", first),
        snapshot("beta", second),
      ]),
    ]);
    const point = result.points[0];

    expect(point.revenue.actual).toBe(300);
    expect(point.revenue.plan).toBe(300);
    expect(point.weightedMqlToSql).toBeCloseTo(27.5);
    expect(point.risks).toEqual({ high: 1, medium: 1, total: 2 });
    expect(point.coverage.published).toBe(2);
    expect(point.coverage.revenueActual).toEqual({
      available: 2,
      missing: 0,
      notApplicable: 0,
      total: 2,
    });
    expect(point.coverage.risks.available).toBe(2);
  });

  it("keeps zero, missing and not applicable distinct in coverage", () => {
    const first = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(0, "ERP");
      report.commercial.revenue.quarterPlan = notApplicableMeasure();
      report.marketing.mqlActual = valueMeasure(0, "CRM");
      report.marketing.sqlActual = valueMeasure(0, "CRM");
      report.collectionStates.risks = "NOT_APPLICABLE";
    });
    const second = content((report) => {
      report.commercial.revenue.quarterActual = missingMeasure();
      report.commercial.revenue.quarterPlan = missingMeasure();
    });

    const point = aggregateQuarterlyTrends([
      quarter(
        2026,
        2,
        [snapshot("alpha", first), snapshot("beta", second)],
        ["alpha", "beta", "gamma"],
      ),
    ]).points[0];

    expect(point.revenue.actual).toBe(0);
    expect(point.revenue.plan).toBeNull();
    expect(point.weightedMqlToSql).toBeNull();
    expect(point.coverage.revenueActual).toEqual({
      available: 1,
      missing: 2,
      notApplicable: 0,
      total: 3,
    });
    expect(point.coverage.revenuePlan).toEqual({
      available: 0,
      missing: 2,
      notApplicable: 1,
      total: 3,
    });
    expect(point.coverage.mqlToSql.available).toBe(1);
    expect(point.coverage.risks.notApplicable).toBe(1);
  });

  it("sorts periods and keeps only the latest four", () => {
    const inputs = [
      quarter(2025, 4, []),
      quarter(2026, 3, []),
      quarter(2026, 1, []),
      quarter(2026, 4, []),
      quarter(2026, 2, []),
    ];

    expect(
      aggregateQuarterlyTrends(inputs).points.map((point) => point.periodId),
    ).toEqual(["2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4"]);
  });

  it("calculates QoQ on the paired product cohort only", () => {
    const previousAlpha = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(100, "ERP");
    });
    const previousBeta = content((report) => {
      report.commercial.revenue.quarterActual = missingMeasure();
    });
    const currentAlpha = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(120, "ERP");
    });
    const currentGamma = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(500, "ERP");
    });

    const result = aggregateQuarterlyTrends([
      quarter(2026, 1, [
        snapshot("alpha", previousAlpha),
        snapshot("beta", previousBeta),
      ]),
      quarter(2026, 2, [
        snapshot("alpha", currentAlpha),
        snapshot("gamma", currentGamma),
      ]),
    ]);

    expect(result.revenueQoq).toMatchObject({
      previousActual: 100,
      currentActual: 120,
      changeAmount: 20,
      changePercent: 20,
      comparedProducts: 1,
      reason: null,
    });
  });

  it("rejects QoQ when money unit or VAT mode differs", () => {
    const previous = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(100, "ERP");
      report.context.vatTreatment = "INCLUDED";
    });
    const current = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(120, "ERP");
      report.context.vatTreatment = "EXCLUDED";
    });

    const result = aggregateQuarterlyTrends([
      quarter(2026, 1, [snapshot("alpha", previous)]),
      quarter(2026, 2, [snapshot("alpha", current)]),
    ]);

    expect(result.revenueQoq.changePercent).toBeNull();
    expect(result.revenueQoq.reason).toBe("MONEY_MODE_MISMATCH");
  });

  it("returns an explicit reason when the previous base is zero", () => {
    const previous = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(0, "ERP");
    });
    const current = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(10, "ERP");
    });

    const result = aggregateQuarterlyTrends([
      quarter(2026, 1, [snapshot("alpha", previous)]),
      quarter(2026, 2, [snapshot("alpha", current)]),
    ]);

    expect(result.revenueQoq.changeAmount).toBe(10);
    expect(result.revenueQoq.changePercent).toBeNull();
    expect(result.revenueQoq.reason).toBe("ZERO_PREVIOUS_ACTUAL");
  });

  it("returns explicit reasons when a comparable QoQ pair is unavailable", () => {
    const actual = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(10, "ERP");
    });

    const onePeriod = aggregateQuarterlyTrends([
      quarter(2026, 1, [snapshot("alpha", actual)]),
    ]);
    expect(onePeriod.revenueQoq.changePercent).toBeNull();
    expect(onePeriod.revenueQoq.reason).toBe("NOT_ENOUGH_PERIODS");

    const differentProducts = aggregateQuarterlyTrends([
      quarter(2026, 1, [snapshot("alpha", actual)]),
      quarter(2026, 2, [snapshot("beta", actual)]),
    ]);
    expect(differentProducts.revenueQoq.changePercent).toBeNull();
    expect(differentProducts.revenueQoq.reason).toBe(
      "NO_COMPARABLE_PRODUCTS",
    );
  });

  it("does not aggregate monetary values with mixed money modes", () => {
    const included = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(10, "ERP");
      report.context.vatTreatment = "INCLUDED";
    });
    const excluded = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(20, "ERP");
      report.context.vatTreatment = "EXCLUDED";
    });

    const point = aggregateQuarterlyTrends([
      quarter(2026, 2, [
        snapshot("alpha", included),
        snapshot("beta", excluded),
      ]),
    ]).points[0];

    expect(point.revenue.actual).toBeNull();
    expect(point.revenue.unavailableReason).toBe("MIXED_MONEY_MODE");
    expect(point.coverage.revenueActual.available).toBe(2);
  });

  it("uses the latest published version for a product within a quarter", () => {
    const older = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(10, "ERP");
    });
    const latest = content((report) => {
      report.commercial.revenue.quarterActual = valueMeasure(25, "ERP");
    });

    const point = aggregateQuarterlyTrends([
      quarter(2026, 2, [
        snapshot("alpha", latest, 2),
        snapshot("alpha", older, 1),
      ]),
    ]).points[0];

    expect(point.revenue.actual).toBe(25);
    expect(point.coverage.published).toBe(1);
  });
});
