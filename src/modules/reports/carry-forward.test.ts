import { describe, expect, it } from "vitest";

import {
  defaultFullReportContent,
  valueMeasure,
} from "./content";
import { carryForwardReportContent } from "./carry-forward";

describe("carryForwardReportContent", () => {
  it("copies only durable context, annual goals and open risks", () => {
    const source = structuredClone(defaultFullReportContent);
    source.context.productOwner = "Анна";
    source.summary.quarterResult = "Не должно переноситься";
    source.commercial.revenue.quarterActual = valueMeasure(42, "ERP");
    source.product.annualGoals.push({
      title: "Рост",
      target: "100",
      result: "50",
      progress: 50,
      status: "В работе",
    });
    source.operations.risks.push(
      {
        title: "Открытый",
        probability: "HIGH",
        impact: "Срок",
        mitigation: "План",
        owner: "Иван",
        status: "OPEN",
      },
      {
        title: "Закрытый",
        probability: "LOW",
        impact: "Нет",
        mitigation: "Готово",
        owner: "Иван",
        status: "CLOSED",
      },
    );

    const result = carryForwardReportContent(source, {
      sourceReportId: "report-q1",
      sourcePeriodLabel: "1 квартал 2026",
      copiedAt: new Date("2026-04-01T00:00:00.000Z"),
    });

    expect(result.context.productOwner).toBe("Анна");
    expect(result.product.annualGoals).toHaveLength(1);
    expect(result.operations.risks.map((risk) => risk.title)).toEqual([
      "Открытый",
    ]);
    expect(result.summary.quarterResult).toBe("");
    expect(result.commercial.revenue.quarterActual.state).toBe("MISSING");
    expect(result.provenance).toEqual({
      copiedFromReportId: "report-q1",
      copiedFromPeriodLabel: "1 квартал 2026",
      copiedAt: "2026-04-01T00:00:00.000Z",
      copiedSections: ["CONTEXT", "ANNUAL_GOALS", "OPEN_RISKS"],
    });
  });
});
