import {
  defaultFullReportContent,
  fullReportContentSchema,
  parseReportContent,
  type FullReportContent,
} from "./content";

export type CarryForwardContext = {
  sourceReportId: string;
  sourcePeriodLabel: string;
  copiedAt: Date;
};

/**
 * Carries only information that remains meaningful across reporting periods.
 * Quarter facts, calculated values, decisions and plans are intentionally reset.
 */
export function carryForwardReportContent(
  sourceValue: unknown,
  context: CarryForwardContext,
): FullReportContent {
  const source = parseReportContent(sourceValue);
  const next = structuredClone(defaultFullReportContent);
  const openRisks = source.operations.risks.filter(
    (risk) => risk.status === "OPEN" || risk.status === "WATCH",
  );

  next.context = structuredClone(source.context);
  next.product.annualGoals = structuredClone(source.product.annualGoals);
  next.operations.risks = structuredClone(openRisks);
  next.collectionStates.annualGoals =
    source.product.annualGoals.length > 0
      ? source.collectionStates.annualGoals
      : "MISSING";
  next.collectionStates.risks =
    openRisks.length > 0 ? source.collectionStates.risks : "ZERO";
  next.provenance = {
    copiedFromReportId: context.sourceReportId,
    copiedFromPeriodLabel: context.sourcePeriodLabel,
    copiedAt: context.copiedAt.toISOString(),
    copiedSections: ["CONTEXT", "ANNUAL_GOALS", "OPEN_RISKS"],
  };

  return fullReportContentSchema.parse(next);
}
