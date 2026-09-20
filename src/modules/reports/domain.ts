export type ReportStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "PUBLISHED";

export function variancePercent(actual: number, plan: number) {
  if (plan === 0) return null;
  return ((actual - plan) / Math.abs(plan)) * 100;
}

export function completionPercent(actual: number, plan: number) {
  if (plan <= 0) return 0;
  return Math.max(0, Math.min(999, (actual / plan) * 100));
}

export function canLeadEdit(status: ReportStatus) {
  return status === "DRAFT" || status === "RETURNED";
}

export function statusLabel(status: ReportStatus) {
  return (
    {
      DRAFT: "Черновик",
      SUBMITTED: "На проверке",
      RETURNED: "Возвращен",
      PUBLISHED: "Опубликован",
    } satisfies Record<ReportStatus, string>
  )[status];
}

export function statusTone(status: ReportStatus) {
  return (
    {
      DRAFT: "neutral",
      SUBMITTED: "warning",
      RETURNED: "danger",
      PUBLISHED: "success",
    } satisfies Record<ReportStatus, string>
  )[status];
}
