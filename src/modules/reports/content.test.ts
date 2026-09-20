import { describe, expect, it } from "vitest";

import {
  defaultFunnelStages,
  defaultFullReportContent,
  fullReportContentSchema,
  measureSchema,
  ratio,
  reportCompleteness,
  reportDerived,
  valueMeasure,
} from "./content";

describe("full report content", () => {
  it("distinguishes zero, missing and not applicable", () => {
    expect(measureSchema.safeParse(valueMeasure(0)).success).toBe(true);
    expect(
      measureSchema.safeParse({
        state: "MISSING",
        value: null,
        source: "",
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        state: "NOT_APPLICABLE",
        value: null,
        source: "Не применяется к продукту",
      }).success,
    ).toBe(true);
    expect(
      measureSchema.safeParse({
        state: "VALUE",
        value: null,
        source: "CRM",
      }).success,
    ).toBe(false);
    expect(
      measureSchema.safeParse({
        state: "VALUE",
        value: 10,
        source: "",
      }).success,
    ).toBe(false);
    expect(
      measureSchema.safeParse({
        state: "VALUE",
        value: -1,
        source: "CRM",
      }).success,
    ).toBe(false);
  });

  it("does not calculate a ratio without both source values", () => {
    expect(
      ratio(valueMeasure(10), {
        state: "MISSING",
        value: null,
        source: "",
      }),
    ).toBeNull();
    expect(ratio(valueMeasure(0), valueMeasure(100))).toBe(0);
    expect(ratio(valueMeasure(20), valueMeasure(40))).toBe(50);
  });

  it("calculates funnel, marketing and expense aggregates", () => {
    const content = structuredClone(defaultFullReportContent);
    content.commercial.revenue.quarterPlan = valueMeasure(100);
    content.commercial.revenue.quarterActual = valueMeasure(90);
    content.commercial.funnel.leads = valueMeasure(200);
    content.commercial.funnel.qualified = valueMeasure(100);
    content.commercial.funnel.proposals = valueMeasure(40);
    content.commercial.funnel.won = valueMeasure(20);
    content.marketing.mqlActual = valueMeasure(80);
    content.marketing.sqlActual = valueMeasure(40);
    content.operations.expenses = [
      {
        category: "ФОТ",
        plan: valueMeasure(12),
        actual: valueMeasure(11),
        comment: "",
      },
    ];

    const derived = reportDerived(content);
    expect(derived.quarterPlanCompletion).toBe(90);
    expect(derived.quarterVariance).toBe(-10);
    expect(derived.funnelConversions.leadToSql).toBe(50);
    expect(derived.funnelConversions.taskedToWon).toBe(50);
    expect(derived.mqlToSql).toBe(50);
    expect(derived.expenseActual).toBe(11);
  });

  it("does not turn missing collection totals into zero", () => {
    const content = structuredClone(defaultFullReportContent);
    expect(reportDerived(content).expenseActual).toBeNull();
    expect(reportDerived(content).lostRevenue).toBeNull();

    content.collectionStates.expenses = "ZERO";
    content.collectionStates.lostDeals = "ZERO";
    expect(reportDerived(content).expenseActual).toBe(0);
    expect(reportDerived(content).lostRevenue).toBe(0);
  });

  it("calculates all five conversions from the structured funnel", () => {
    const content = structuredClone(defaultFullReportContent);
    content.commercial.funnelStages = defaultFunnelStages();
    const stageValues = [
      [60, 30, 10],
      [25, 15, 10],
      [10, 5, 5],
      [10, 0, 0],
    ];

    content.commercial.funnelStages.forEach((stage, index) => {
      const [active, nextStage, cancelled] = stageValues[index];
      stage.active = valueMeasure(active);
      stage.nextStage = valueMeasure(nextStage);
      stage.cancelled = valueMeasure(cancelled);
    });

    expect(fullReportContentSchema.safeParse(content).success).toBe(true);
    expect(reportDerived(content).funnelConversions).toEqual({
      leadToSql: 50,
      sqlToTasked: 40,
      taskedToWon: 50,
      leadToWon: 10,
      sqlToWon: 20,
    });
  });

  it("rejects a structured funnel that grows between stages", () => {
    const content = structuredClone(defaultFullReportContent);
    content.commercial.funnelStages = defaultFunnelStages();

    content.commercial.funnelStages.forEach((stage) => {
      stage.active = valueMeasure(10);
      stage.nextStage = valueMeasure(0);
      stage.cancelled = valueMeasure(0);
    });
    content.commercial.funnelStages[2].active = valueMeasure(5);
    content.commercial.funnelStages[3].active = valueMeasure(6);

    expect(fullReportContentSchema.safeParse(content).success).toBe(false);
  });

  it("does not count an empty record as a completed section", () => {
    const content = structuredClone(defaultFullReportContent);
    content.product.launches = [
      {
        title: "",
        status: "",
        plannedDate: "",
        actualDate: "",
        result: "",
      },
    ];
    content.collectionStates.hypotheses = "NOT_APPLICABLE";
    content.collectionStates.annualGoals = "NOT_APPLICABLE";

    expect(reportCompleteness(content).sections.product).toBe(false);
  });

  it("validates the complete report contract", () => {
    expect(fullReportContentSchema.safeParse(defaultFullReportContent).success).toBe(
      true,
    );
    expect(reportCompleteness(defaultFullReportContent).percent).toBe(0);
  });
});
