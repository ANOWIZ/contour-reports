import { ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { ReportContentView } from "@/components/report-content-view";
import { ReportHistory } from "@/components/report-history";
import { requireManagement } from "@/modules/auth/session";
import { reviewReport } from "@/modules/reports/actions";
import { statusLabel, statusTone } from "@/modules/reports/domain";
import { getManagementReportDetail } from "@/modules/reports/queries";

export const dynamic = "force-dynamic";

export default async function ManagementReportPage({
  params,
}: {
  params: Promise<{ reportId: string }>;
}) {
  const session = await requireManagement();
  const { reportId } = await params;
  const data = await getManagementReportDetail(reportId);
  if (!data) notFound();

  return (
    <AppShell session={session} active="portfolio">
      <Link className="back-link" href="/portfolio">
        <ArrowLeft size={15} /> Все продукты
      </Link>
      <header className="page-head report-detail-head">
        <div>
          <p className="eyebrow">{data.report.productCode}</p>
          <h1>{data.report.productName}</h1>
          <p className="subtle">
            Полный управленческий отчет · {data.report.periodLabel}
          </p>
        </div>
        <div className="report-detail-status">
          <span className={`status ${statusTone(data.report.status)}`}>
            {statusLabel(data.report.status)}
          </span>
          <span>{data.completeness.percent}% заполнено</span>
          <a
            className="button secondary"
            href={`/api/reports/${data.report.id}/export/pptx`}
          >
            <Download size={15} /> Скачать PowerPoint
          </a>
        </div>
      </header>

      <ReportContentView content={data.report.content} />

      <div className="surface report-detail-history">
        <ReportHistory
          versions={data.timeline.versions}
          reviews={data.timeline.reviews}
        />
      </div>

      {data.report.status === "SUBMITTED" ? (
        <form action={reviewReport} className="review-bar">
          <input type="hidden" name="reportId" value={data.report.id} />
          <div className="field">
            <label htmlFor="review-comment">Комментарий руководства</label>
            <textarea
              id="review-comment"
              name="comment"
              placeholder="Что нужно уточнить или изменить"
              required
            />
          </div>
          <div className="button-group">
            <button
              className="button danger"
              name="decision"
              value="RETURNED"
              type="submit"
            >
              Вернуть на доработку
            </button>
            <button
              className="button"
              name="decision"
              value="PUBLISHED"
              type="submit"
            >
              Опубликовать
            </button>
          </div>
        </form>
      ) : null}
    </AppShell>
  );
}
