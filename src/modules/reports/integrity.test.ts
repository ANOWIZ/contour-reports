import { describe, expect, it } from "vitest";

import {
  defaultFullReportContent,
  type FullReportContent,
} from "./content";
import { reportContentHash } from "./integrity";

describe("reportContentHash", () => {
  it("does not depend on object key order", () => {
    const reordered = Object.fromEntries(
      Object.entries(defaultFullReportContent).reverse(),
    ) as FullReportContent;
    expect(reportContentHash(defaultFullReportContent)).toBe(
      reportContentHash(reordered),
    );
  });

  it("changes when report data changes", () => {
    const changed = structuredClone(defaultFullReportContent);
    changed.summary.quarterResult = "Новый результат";
    expect(reportContentHash(defaultFullReportContent)).not.toBe(
      reportContentHash(changed),
    );
  });
});
