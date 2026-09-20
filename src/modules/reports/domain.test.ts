import { describe, expect, it } from "vitest";

import {
  canLeadEdit,
  completionPercent,
  statusLabel,
  variancePercent,
} from "./domain";

describe("report domain", () => {
  it("calculates variance against plan", () => {
    expect(variancePercent(110, 100)).toBe(10);
    expect(variancePercent(90, 100)).toBe(-10);
    expect(variancePercent(0, 0)).toBeNull();
    expect(variancePercent(10, 0)).toBeNull();
  });

  it("bounds completion for chart rendering", () => {
    expect(completionPercent(50, 100)).toBe(50);
    expect(completionPercent(1200, 100)).toBe(999);
    expect(completionPercent(10, 0)).toBe(0);
  });

  it("allows leads to edit only drafts and returned reports", () => {
    expect(canLeadEdit("DRAFT")).toBe(true);
    expect(canLeadEdit("RETURNED")).toBe(true);
    expect(canLeadEdit("SUBMITTED")).toBe(false);
    expect(canLeadEdit("PUBLISHED")).toBe(false);
  });

  it("maps every status to a Russian label", () => {
    expect(statusLabel("PUBLISHED")).toBe("Опубликован");
  });
});
