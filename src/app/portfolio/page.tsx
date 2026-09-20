import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Search,
} from "lucide-react";
import Link from "next/link";

import { AppShell } from "@/components/app-shell";
import { PortfolioChart } from "@/components/portfolio-chart";
import { PortfolioTrends } from "@/components/portfolio-trends";
import { requireManagement } from "@/modules/auth/session";
import { reviewReport } from "@/modules/reports/actions";
import type {
  DecisionCategory,
  Measure,
} from "@/modules/reports/content";
import { statusLabel, statusTone } from "@/modules/reports/domain";
import { getManagementPortfolio } from "@/modules/reports/queries";

export const dynamic = "force-dynamic";

const number = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});
const shortDate = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "short",
});

const decisionCategoryLabels: Record<DecisionCategory, string> = {
  ACTIVITIES: "Мероприятия и сроки",
  TARGETS: "Целевые показатели",
  RESOURCES: "Поддержка и ресурсы",
  PRIORITIES: "Приоритеты следующего квартала",
  OTHER: "Другое",
};

const actionStatusLabels = {
  PLANNED: "Запланировано",
  IN_PROGRESS: "В работе",
  DONE: "Выполнено",
  BLOCKED: "Заблокировано",
} as const;

const riskProbabilityLabels = {
  LOW: "Низкая",
  MEDIUM: "Средняя",
  HIGH: "Высокая",
} as const;

function showNumber(value: number | null, unit = "") {
  return value === null
    ? "Нет данных"
    : `${number.format(value)}${unit ? ` ${unit}` : ""}`;
}

function showPercent(value: number | null) {
  return value === null
    ? "Нет данных"
    : `${value >= 0 ? "+" : ""}${number.format(value)}%`;
}

function showMeasure(measure: Measure, unit: string) {
  if (measure.state === "MISSING") return "Нет данных";
  if (measure.state === "NOT_APPLICABLE") return "Не применимо";
  return showNumber(measure.value, unit);
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{
    period?: string;
    status?: string;
    q?: string;
  }>;
}) {
  const session = await requireManagement();
  const params = await searchParams;
  const portfolio = await getManagementPortfolio({
    periodId: params.period,
    status: params.status,
    query: params.q,
  });
  const totalVariance =
    portfolio.totals.revenueComparable &&
    portfolio.totals.revenuePlan !== null &&
    portfolio.totals.revenueActual !== null &&
    portfolio.totals.revenuePlan !== 0
      ? ((portfolio.totals.revenueActual - portfolio.totals.revenuePlan) /
          Math.abs(portfolio.totals.revenuePlan)) *
        100
      : null;
  const vatLabel =
    portfolio.totals.vatTreatment === "INCLUDED"
      ? "с НДС"
      : portfolio.totals.vatTreatment === "EXCLUDED"
        ? "без НДС"
        : "смешанный НДС";
  const moneyUnit = `${portfolio.totals.moneyUnit}, ${vatLabel}`;

  return (
    <AppShell session={session} active="portfolio">
      <header className="page-head">
        <div>
          <p className="eyebrow">Обзор портфеля</p>
          <h1>Состояние продуктов</h1>
          <p className="subtle">
            Отклонения, риски и запросы на решения собраны из исходных отчетов.
          </p>
        </div>
        <div className="period-switcher">{portfolio.periodLabel}</div>
      </header>

      <form className="portfolio-filters" method="get" aria-label="Фильтры отчетов">
        <div className="field">
          <label htmlFor="period">Период</label>
          <select id="period" name="period" defaultValue={portfolio.selectedPeriodId}>
            {portfolio.periods.map((period) => (
              <option value={period.id} key={period.id}>
                {period.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status">Статус отчета</label>
          <select id="status" name="status" defaultValue={params.status ?? "ALL"}>
            <option value="ALL">Все статусы</option>
            <option value="MISSING">Отчет не создан</option>
            <option value="DRAFT">Черновик</option>
            <option value="SUBMITTED">На проверке</option>
            <option value="RETURNED">Возвращен</option>
            <option value="PUBLISHED">Опубликован</option>
          </select>
        </div>
        <div className="field filter-search">
          <label htmlFor="q">Продукт или владелец</label>
          <input
            id="q"
            name="q"
            defaultValue={params.q ?? ""}
            placeholder="Название, код или ФИО"
          />
        </div>
        <button className="button" type="submit">
          <Search size={15} /> Применить
        </button>
        <Link className="button ghost" href="/portfolio">
          Сбросить
        </Link>
      </form>

      {!portfolio.totals.moneyComparable ? (
        <div className="data-warning" role="status">
          Денежные итоги не суммируются: в выбранных отчетах различаются единицы
          или режим учета НДС. Значения доступны на уровне продуктов.
        </div>
      ) : null}

      <section
        className="portfolio-kpi-grid"
        aria-label="Ключевые показатели портфеля"
      >
        <div>
          <span>Выручка, факт / план</span>
          <strong>
            {showNumber(portfolio.totals.revenueActual, moneyUnit)} /{" "}
            {showNumber(portfolio.totals.revenuePlan, moneyUnit)}
          </strong>
          <small>
            {showPercent(totalVariance)} · факт у{" "}
            {portfolio.totals.revenueActualCoverage}, план у{" "}
            {portfolio.totals.revenuePlanCoverage} из{" "}
            {portfolio.totals.products}
          </small>
        </div>
        <div>
          <span>Прогноз года</span>
          <strong>{showNumber(portfolio.totals.yearForecast, moneyUnit)}</strong>
          <small>
            данные у {portfolio.totals.forecastCoverage} из{" "}
            {portfolio.totals.products}
          </small>
        </div>
        <div>
          <span>LEADS → успешная сделка</span>
          <strong>
            {portfolio.totals.weightedConversion === null
              ? "Нет данных"
              : `${number.format(portfolio.totals.weightedConversion)}%`}
          </strong>
          <small>
            взвешенно по {portfolio.totals.conversionCoverage} продуктам
          </small>
        </div>
        <div>
          <span>Потерянная выручка</span>
          <strong>{showNumber(portfolio.totals.lostRevenue, moneyUnit)}</strong>
          <small>
            данные у {portfolio.totals.lostRevenueCoverage} из{" "}
            {portfolio.totals.products}
          </small>
        </div>
        <div>
          <span>Риски / решения</span>
          <strong>
            {portfolio.totals.openRisks} / {portfolio.totals.decisions}
          </strong>
          <small>{portfolio.totals.highRisks} рисков высокой вероятности</small>
        </div>
        <div>
          <span>Готовность отчетов</span>
          <strong>
            {portfolio.totals.published} / {portfolio.totals.products}
          </strong>
          <small>
            {portfolio.totals.missingReports
              ? `${portfolio.totals.missingReports} отчетов не создано`
              : "все направления завели отчет"}
            {portfolio.totals.staleReports
              ? ` · ${portfolio.totals.staleReports} устарели`
              : ""}
          </small>
        </div>
      </section>

      <PortfolioTrends trends={portfolio.trends} />

      <section className="management-focus">
        <div className="surface-head">
          <div>
            <p className="section-number">ФОКУС РУКОВОДСТВА</p>
            <h2>Что требует реакции</h2>
            <p className="subtle">
              Каждый сигнал связан с продуктом и исходной записью отчета.
            </p>
          </div>
        </div>
        <div className="management-lanes">
          <article className="management-lane">
            <header>
              <span>01</span>
              <div>
                <h3>Запросы на решения</h3>
                <p>{portfolio.exceptions.decisions.length} пунктов</p>
              </div>
            </header>
            <div className="lane-records">
              {portfolio.exceptions.decisions.length ? (
                portfolio.exceptions.decisions.map((decision, index) => (
                  <Link
                    href={`/portfolio/${decision.reportId}`}
                    className="lane-record"
                    key={`${decision.reportId}-${decision.subject}-${index}`}
                  >
                    <small>
                      {decision.productName} ·{" "}
                      {decisionCategoryLabels[decision.category]}
                    </small>
                    <strong>{decision.subject}</strong>
                    <p>{decision.requestedDecision}</p>
                    <span>Эффект: {decision.expectedImpact}</span>
                  </Link>
                ))
              ) : (
                <p className="empty-inline">Запросов на решения нет.</p>
              )}
            </div>
          </article>

          <article className="management-lane">
            <header>
              <span>02</span>
              <div>
                <h3>Отклонения и прогноз</h3>
                <p>{portfolio.exceptions.revenue.length} направлений</p>
              </div>
            </header>
            <div className="lane-records">
              {portfolio.exceptions.revenue.length ? (
                portfolio.exceptions.revenue.map((item) => (
                  <Link
                    href={`/portfolio/${item.reportId}`}
                    className="lane-record"
                    key={item.reportId}
                  >
                    <small>{item.productName}</small>
                    <strong>
                      Квартал {showPercent(item.revenueVariance)} · год{" "}
                      {showPercent(item.forecastVariance)}
                    </strong>
                    <p>{item.reason || "Причина не указана"}</p>
                    <span>
                      Мера: {item.action || "не указана"}
                      {item.actionOwner ? ` · ${item.actionOwner}` : ""}
                      {item.actionDueDate ? ` · до ${item.actionDueDate}` : ""}
                      {" · "}
                      {actionStatusLabels[item.actionStatus]}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="empty-inline">Негативных отклонений не выявлено.</p>
              )}
            </div>
          </article>

          <article className="management-lane">
            <header>
              <span>03</span>
              <div>
                <h3>Открытые риски</h3>
                <p>{portfolio.exceptions.risks.length} пунктов</p>
              </div>
            </header>
            <div className="lane-records">
              {portfolio.exceptions.risks.length ? (
                portfolio.exceptions.risks.map((risk, index) => (
                  <Link
                    href={`/portfolio/${risk.reportId}`}
                    className="lane-record"
                    key={`${risk.reportId}-${risk.title}-${index}`}
                  >
                    <small>
                      {risk.productName} ·{" "}
                      {riskProbabilityLabels[risk.probability]} вероятность
                    </small>
                    <strong>{risk.title}</strong>
                    <p>Влияние: {risk.impact}</p>
                    <span>Меры: {risk.mitigation} · {risk.owner}</span>
                  </Link>
                ))
              ) : (
                <p className="empty-inline">Открытых рисков нет.</p>
              )}
            </div>
          </article>
        </div>
      </section>

      <div className="portfolio-workspace">
        <section className="surface">
          <div className="surface-head">
            <div>
              <h2>План и факт выручки</h2>
              <p className="subtle">{moneyUnit}, текущий квартал</p>
            </div>
          </div>
          <div className="surface-body">
            {portfolio.totals.moneyComparable ? (
              <PortfolioChart
                data={portfolio.rows.map((row) => ({
                  name: row.productCode,
                  plan: row.revenuePlan,
                  actual: row.revenueActual,
                }))}
              />
            ) : (
              <p className="empty-inline">
                График скрыт: денежные значения имеют разные единицы или режимы
                НДС.
              </p>
            )}
          </div>
        </section>

        <section className="surface table-surface">
          <div className="surface-head">
            <div>
              <h2>Направления</h2>
              <p className="subtle">
                Показатели, готовность и управленческие сигналы в одном срезе
              </p>
            </div>
          </div>
          {portfolio.rows.length ? (
            <div className="data-table-wrap flush-table">
              <table className="portfolio-table">
                <thead>
                  <tr>
                    <th>Продукт</th>
                    <th>Лид</th>
                    <th>Выручка факт / план</th>
                    <th>Прогноз года</th>
                    <th>Конверсия</th>
                    <th>Потери</th>
                    <th>Риски / решения</th>
                    <th>Заполнение</th>
                    <th>Обновлено</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.rows.map((row) => (
                    <tr key={row.productId}>
                      <td>
                        <div className="product-cell">
                          <span
                            className="product-dot"
                            style={{ background: row.accent }}
                          />
                          <span>
                            {row.reportId ? (
                              <Link href={`/portfolio/${row.reportId}`}>
                                <strong>{row.productName}</strong>
                              </Link>
                            ) : (
                              <strong>{row.productName}</strong>
                            )}
                            <span className="product-code">{row.productCode}</span>
                          </span>
                        </div>
                      </td>
                      <td>{row.leadName}</td>
                      <td>
                        {showNumber(row.revenueActual, row.moneyUnit)} /{" "}
                        {showNumber(row.revenuePlan, row.moneyUnit)}
                        <span
                          className={
                            row.revenueVariance !== null &&
                            row.revenueVariance >= 0
                              ? "variance-positive inline-variance"
                              : "variance-negative inline-variance"
                          }
                        >
                          {row.revenueVariance === null ? null : row.revenueVariance >= 0 ? (
                            <ArrowUpRight size={13} />
                          ) : (
                            <ArrowDownRight size={13} />
                          )}
                          {row.revenueVariance === null
                            ? "нет расчета"
                            : `${Math.abs(row.revenueVariance).toFixed(1)}%`}
                        </span>
                      </td>
                      <td>{showNumber(row.yearForecast, row.moneyUnit)}</td>
                      <td>
                        {row.leadToWon === null
                          ? "Нет данных"
                          : `${number.format(row.leadToWon)}%`}
                      </td>
                      <td>{showNumber(row.lostRevenue, row.moneyUnit)}</td>
                      <td>{row.openRisks} / {row.decisions}</td>
                      <td>{row.completeness}%</td>
                      <td>
                        {row.updatedAt ? shortDate.format(row.updatedAt) : "—"}
                        {row.isStale && row.hasReport ? (
                          <span className="stale-label">Устарело</span>
                        ) : null}
                      </td>
                      <td>
                        {row.status ? (
                          <span className={`status ${statusTone(row.status)}`}>
                            {statusLabel(row.status)}
                          </span>
                        ) : (
                          <span className="status danger">Не создан</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-state">
              <h3>По фильтрам ничего не найдено</h3>
              <p className="subtle">Сбросьте фильтры или выберите другой период.</p>
            </div>
          )}
        </section>
      </div>

      <div className="portfolio-detail-grid">
        <section className="surface">
          <div className="surface-head">
            <div>
              <h2>Ключевые сделки портфеля</h2>
              <p className="subtle">Заказчик, предмет, статус и сумма</p>
            </div>
          </div>
          {portfolio.exceptions.keyDeals.length ? (
            <div className="data-table-wrap flush-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Продукт</th>
                    <th>Заказчик</th>
                    <th>Предмет</th>
                    <th>Статус</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolio.exceptions.keyDeals.map((deal, index) => (
                    <tr key={`${deal.reportId}-${deal.customer}-${index}`}>
                      <td>
                        <Link href={`/portfolio/${deal.reportId}`}>
                          {deal.productName}
                        </Link>
                      </td>
                      <td>{deal.customer}</td>
                      <td>{deal.subject}</td>
                      <td>{deal.status}</td>
                      <td>{showMeasure(deal.amountVat, deal.moneyUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="empty-inline">Ключевые сделки не указаны.</p>
          )}
        </section>

        <section className="surface">
          <div className="surface-head">
            <div>
              <h2>Системные проблемы и ресурсы</h2>
              <p className="subtle">Повторяющиеся потери и дефициты команд</p>
            </div>
          </div>
          <div className="surface-body signal-list">
            {portfolio.exceptions.systemicProblems.map((item) => (
              <div className="signal-row" key={item.problem}>
                <AlertTriangle size={16} />
                <div>
                  <strong>{item.problem}</strong>
                  <p>
                    {item.count} случаев · {item.products.join(", ")}
                  </p>
                </div>
              </div>
            ))}
            {portfolio.exceptions.resourceIssues.map((item, index) => (
              <Link
                href={`/portfolio/${item.reportId}`}
                className="signal-row"
                key={`${item.reportId}-${item.role}-${index}`}
              >
                <AlertTriangle size={16} />
                <div>
                  <strong>{item.productName} · {item.role}</strong>
                  <p>
                    {item.issue}
                    {item.load === null ? "" : ` · загрузка ${item.load}%`}
                  </p>
                </div>
              </Link>
            ))}
            {!portfolio.exceptions.systemicProblems.length &&
            !portfolio.exceptions.resourceIssues.length ? (
              <p className="empty-inline">Системных проблем не указано.</p>
            ) : null}
          </div>
        </section>
      </div>

      <section className="surface">
        <div className="surface-head">
          <div>
            <h2>Приоритеты следующего квартала</h2>
            <p className="subtle">
              Цели, действия, ожидаемый результат, ответственный и срок
            </p>
          </div>
        </div>
        {portfolio.exceptions.nextQuarter.length ? (
          <div className="priority-ledger">
            {portfolio.exceptions.nextQuarter.map((item, index) => (
              <Link
                href={`/portfolio/${item.reportId}`}
                key={`${item.reportId}-${item.goal}-${index}`}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <small>{item.productName} · {item.owner} · до {item.dueDate || "—"}</small>
                  <strong>{item.goal}</strong>
                  <p>{item.actions}</p>
                </div>
                <b>{item.expectedResult}</b>
              </Link>
            ))}
          </div>
        ) : (
          <p className="empty-inline">Планы следующего квартала не заполнены.</p>
        )}
      </section>

      {portfolio.rows.some((row) => row.status === "SUBMITTED") ? (
        <section className="surface review-queue">
          <div className="surface-head">
            <div>
              <h2>Очередь на проверку</h2>
              <p className="subtle">
                Комментарий к решению обязателен; публикация фиксирует отчет.
              </p>
            </div>
          </div>
          <div className="review-grid">
            {portfolio.rows
              .filter((row) => row.status === "SUBMITTED")
              .map((row) => (
                <form action={reviewReport} key={row.reportId}>
                  <input type="hidden" name="reportId" value={row.reportId ?? ""} />
                  <h3>{row.productName}</h3>
                  <p className="subtle">{row.completeness}% заполнено</p>
                  <div className="field">
                    <label htmlFor={`comment-${row.productId}`}>Комментарий</label>
                    <textarea
                      id={`comment-${row.productId}`}
                      name="comment"
                      placeholder="Что уточнить или зафиксировать"
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
                      Вернуть
                    </button>
                    <button
                      className="button"
                      name="decision"
                      value="PUBLISHED"
                      type="submit"
                    >
                      <CheckCircle2 size={15} /> Опубликовать
                    </button>
                  </div>
                </form>
              ))}
          </div>
        </section>
      ) : null}
    </AppShell>
  );
}
