import { createHash } from "node:crypto";

import type { FullReportContent } from "./content";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(
      ([key, entryValue]) =>
        `${JSON.stringify(key)}:${canonicalJson(entryValue)}`,
    );
  return `{${entries.join(",")}}`;
}

export function reportContentHash(content: FullReportContent) {
  return createHash("sha256").update(canonicalJson(content)).digest("hex");
}

export function reportProjection(content: FullReportContent) {
  return {
    executiveSummary: content.summary.quarterResult,
    achievements: content.product.annualGoals
      .map((goal) => `${goal.title}: ${goal.result}`)
      .join("\n"),
    nextSteps: content.nextQuarter
      .map((item) => `${item.goal}: ${item.expectedResult}`)
      .join("\n"),
  };
}
