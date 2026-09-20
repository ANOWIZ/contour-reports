import { AppShell } from "@/components/app-shell";
import { ReportHistory } from "@/components/report-history";
import { requireProductLead } from "@/modules/auth/session";
import { createQuarterReport } from "@/modules/reports/actions";
import {
  statusLabel,
  statusTone,
} from "@/modules/reports/domain";
import {
  reportCompleteness,
  reportDerived,
} from "@/modules/reports/content";
import { getLeadReport } from "@/modules/reports/queries";
import { ReportEditor } from "./report-editor";

export const dynamic = "force-dynamic";

export default async function MyReportPage() {
  const session = await requireProductLead();
  const data = await getLeadReport();

  if (!data) {
    return (
      <AppShell session={session} active="report">
        <div className="surface empty-state">
          <h1>Отчет еще не создан</h1>
          <p className="subtle">
            Попросите администратора открыть отчетный период для продукта.
          </p>
        </div>
      </AppShell>
    );
  }

  if (!data.activePeriod) {
    return (
      <AppShell session={session} active="report">
        <div className="surface empty-state">
          <h1>Нет активного отчетного периода</h1>
          <p className="subtle">
            Руководству нужно открыть новый квартал. Исторические отчеты
            сохранены и не изменяются.
          </p>
        </div>
      </AppShell>
    );
  }

  if (!data.report) {
    return (
      <AppShell session={session} active="report">
        <header className="page-head">
          <div>
            <p className="eyebrow">{data.product.code}</p>
            <h1>{data.product.name}</h1>
            <p className="subtle">Новый квартальный отчет</p>
          </div>
          <div className="period-switcher">{data.activePeriod.label}</div>
        </header>
        <section className="surface create-report-panel">
          <div>
            <p className="section-number">НОВЫЙ ПЕРИОД</p>
            <h2>Создать отчет за {data.activePeriod.label}</h2>
            <p className="subtle">
              Можно начать с чистого отчета или безопасно перенести только
              постоянный контекст, годовые цели и незакрытые риски из
              опубликованного предыдущего квартала. Факты и планы квартала не
              копируются.
            </p>
          </div>
          <form action={createQuarterReport} className="button-group">
            <button
              className="button secondary"
              type="submit"
              name="copyPrevious"
              value="false"
            >
              Создать чистый отчет
            </button>
            <button
              className="button"
              type="submit"
              name="copyPrevious"
              value="true"
            >
              Перенести постоянные данные
            </button>
          </form>
        </section>
      </AppShell>
    );
  }

  const completeness = reportCompleteness(data.report.content);
  const derived = reportDerived(data.report.content);

  return (
    <AppShell session={session} active="report">
      <header className="page-head">
        <div>
          <p className="eyebrow">{data.report.productCode}</p>
          <h1>{data.report.productName}</h1>
          <p className="subtle">
            Квартальный отчет · данные сохраняются в едином формате
          </p>
        </div>
        <div className="page-head-actions">
          <div className="period-switcher">{data.report.periodLabel}</div>
          <div className="page-head-status">
            <span className={`status ${statusTone(data.report.status)}`}>
              {statusLabel(data.report.status)}
            </span>
          </div>
          <a
            className="button secondary"
            href={`/api/reports/${data.report.id}/export/pptx`}
          >
            <Download size={15} /> Скачать PowerPoint
          </a>
        </div>
      </header>

      <div className="report-layout">
        <div>
          {data.report.content.provenance ? (
            <div className="carry-forward-note" role="status">
              Перенесены постоянный контекст, годовые цели и открытые риски из
              отчета за {data.report.content.provenance.copiedFromPeriodLabel}.
              Проверьте их актуальность.
            </div>
          ) : null}
          <ReportEditor report={data.report} />
        </div>

        <aside className="surface">
          <div className="side-section">
            <h2>Готовность отчета</h2>
            <div className="completion-row">
              <span>Заполнено</span>
              <strong>{completeness.percent}%</strong>
            </div>
            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${completeness.percent}%` }}
              />
            </div>
            <p className="risk-meta">
              Обновлено{" "}
              {new Intl.DateTimeFormat("ru-RU", {
                day: "numeric",
                month: "long",
                hour: "2-digit",
                minute: "2-digit",
              }).format(data.report.updatedAt)}
            </p>
          </div>

          <div className="side-section">
            <h3>Автоматические расчеты</h3>
            <div className="risk-line">
              <strong>Выполнение плана выручки</strong>
              <div className="risk-meta">
                {derived.quarterPlanCompletion === null
                  ? "Недостаточно данных"
                  : `${derived.quarterPlanCompletion.toFixed(1)}%`}
              </div>
            </div>
            <div className="risk-line">
              <strong>Конверсия MQL → SQL</strong>
              <div className="risk-meta">
                {derived.mqlToSql === null
                  ? "Недостаточно данных"
                  : `${derived.mqlToSql.toFixed(1)}%`}
              </div>
            </div>
          </div>

          <div className="side-section">
            <h3>Риски</h3>
            {data.report.content.operations.risks.length ? (
              data.report.content.operations.risks.map((risk, index) => (
                <div className="risk-line" key={`${risk.title}-${index}`}>
                  <strong>{risk.title}</strong>
                  <div className="risk-meta">
                    {risk.probability === "HIGH"
                      ? "Высокая вероятность"
                      : risk.probability === "MEDIUM"
                        ? "Средняя вероятность"
                        : "Низкая вероятность"}
                    {" · "}
                    {risk.impact}
                  </div>
                </div>
              ))
            ) : (
              <p className="subtle">Открытых рисков нет.</p>
            )}
          </div>

          <div className="side-section">
            <h3>Запросы на решения</h3>
            {data.report.content.decisions.length ? (
              data.report.content.decisions.map((decision, index) => (
                <div className="initiative-line" key={`${decision.subject}-${index}`}>
                  <strong>{decision.subject}</strong>
                  <div className="risk-meta">{decision.requestedDecision}</div>
                </div>
              ))
            ) : (
              <p className="subtle">Запросы не добавлены.</p>
            )}
          </div>

          {data.report.managementDecision ? (
            <div className="side-section">
              <h3>Комментарий руководства</h3>
              <p className="subtle">{data.report.managementDecision}</p>
            </div>
          ) : null}

          <div className="side-section">
            <h3>Отправка на проверку</h3>
            <p className="risk-meta">
              {completeness.percent < 100
                ? "Заполните обязательные разделы. Кнопка отправки находится внизу редактора и всегда передает текущие данные."
                : "После отправки редактирование будет закрыто до решения руководства."}
            </p>
          </div>

          <div className="side-section">
            <ReportHistory
              versions={data.timeline.versions}
              reviews={data.timeline.reviews}
            />
          </div>

          <div className="side-section quarterly-history">
            <h3>Отчеты по кварталам</h3>
            <ol>
              {data.quarterlyReports.map((item) => (
                <li key={item.id}>
                  <span>{item.periodLabel}</span>
                  <strong>{statusLabel(item.status)}</strong>
                  <small>
                    {item.version
                      ? `версия ${item.version}`
                      : "еще не отправлялся"}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </div>
    </AppShell>
  );
}
import { Download } from "lucide-react";
