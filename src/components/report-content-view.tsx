import type {
  CollectionState,
  DecisionCategory,
  FullReportContent,
  Measure,
} from "@/modules/reports/content";
import {
  collectionStateLabel,
  reportDerived,
} from "@/modules/reports/content";

const number = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

function showMeasure(measure: Measure, unit: string) {
  if (measure.state === "MISSING") return "Нет данных";
  if (measure.state === "NOT_APPLICABLE") return "Не применимо";
  return measure.value === null ? "Нет данных" : `${number.format(measure.value)} ${unit}`;
}

function Source({ measure }: { measure: Measure }) {
  return measure.source ? <small>Источник: {measure.source}</small> : null;
}

function EmptyRow({ text = "Данные не заполнены" }: { text?: string }) {
  return <p className="empty-inline">{text}</p>;
}

function EmptyCollection({ state }: { state: CollectionState }) {
  return <EmptyRow text={collectionStateLabel(state)} />;
}

const decisionCategoryLabels: Record<DecisionCategory, string> = {
  ACTIVITIES: "Мероприятия и сроки",
  TARGETS: "Целевые показатели",
  RESOURCES: "Поддержка и ресурсы",
  PRIORITIES: "Приоритеты следующего квартала",
  OTHER: "Другое",
};

const riskProbabilityLabels = {
  LOW: "Низкая вероятность",
  MEDIUM: "Средняя вероятность",
  HIGH: "Высокая вероятность",
} as const;

const riskStatusLabels = {
  OPEN: "Открыт",
  WATCH: "Наблюдение",
  CLOSED: "Закрыт",
} as const;

const actionStatusLabels = {
  PLANNED: "Запланировано",
  IN_PROGRESS: "В работе",
  DONE: "Выполнено",
  BLOCKED: "Заблокировано",
} as const;

export function ReportContentView({
  content,
}: {
  content: FullReportContent;
}) {
  const derived = reportDerived(content);
  const revenue = content.commercial.revenue;
  const moneyUnit = content.context.moneyUnit || "млн ₽";
  const vatLabel =
    content.context.vatTreatment === "INCLUDED"
      ? "с НДС"
      : content.context.vatTreatment === "EXCLUDED"
        ? "без НДС"
        : "смешанный НДС";
  const moneyUnitWithVat = `${moneyUnit}, ${vatLabel}`;
  const showPercent = (value: number | null) =>
    value === null ? "Нет данных" : `${number.format(value)}%`;

  return (
    <div className="management-report">
      <section className="report-view-section executive-section">
        <p className="eyebrow">Итоги квартала</p>
        <h2>{content.summary.quarterResult || "Резюме не заполнено"}</h2>
        <div className="executive-kpis" aria-label="Ключевые итоги квартала">
          <div>
            <span>Выручка, факт / план</span>
            <strong>
              {showMeasure(revenue.quarterActual, moneyUnitWithVat)} /{" "}
              {showMeasure(revenue.quarterPlan, moneyUnitWithVat)}
            </strong>
            <small>{showPercent(derived.quarterPlanCompletion)} выполнения</small>
          </div>
          <div>
            <span>Прогноз года</span>
            <strong>{showMeasure(revenue.yearForecast, moneyUnitWithVat)}</strong>
            <small>{showPercent(derived.yearForecastCompletion)} годового плана</small>
          </div>
          <div>
            <span>Пресейлы, факт / план</span>
            <strong>
              {showMeasure(content.commercial.presales.actual, "шт.")} /{" "}
              {showMeasure(content.commercial.presales.plan, "шт.")}
            </strong>
            <small>{showPercent(derived.presalesCompletion)} выполнения</small>
          </div>
          <div>
            <span>LEADS → успешная сделка</span>
            <strong>{showPercent(derived.funnelConversions.leadToWon)}</strong>
            <small>расчет по полной воронке</small>
          </div>
        </div>
        <div className="executive-grid">
          <div>
            <span>Главные проблемы</span>
            <p>{content.summary.mainProblems || "Нет данных"}</p>
          </div>
          <div>
            <span>Главный риск</span>
            <p>{content.summary.mainRisk || "Нет данных"}</p>
          </div>
          <div>
            <span>Требуется внимание</span>
            <p>{content.summary.requestedAttention || "Нет запросов"}</p>
          </div>
        </div>
        <h3 className="subsection-title">Пресейлы</h3>
        <div className="view-metrics compact-metrics">
          <div>
            <span>План</span>
            <strong>
              {showMeasure(content.commercial.presales.plan, "шт.")}
            </strong>
            <Source measure={content.commercial.presales.plan} />
          </div>
          <div>
            <span>Факт</span>
            <strong>
              {showMeasure(content.commercial.presales.actual, "шт.")}
            </strong>
            <Source measure={content.commercial.presales.actual} />
          </div>
          <div>
            <span>Комментарий</span>
            <strong>{content.commercial.presales.comment || "—"}</strong>
          </div>
        </div>
        <h3 className="subsection-title">Пресейлы по кварталам</h3>
        {content.commercial.presales.series.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Период</th>
                  <th>Количество</th>
                  <th>Источник</th>
                </tr>
              </thead>
              <tbody>
                {content.commercial.presales.series.map((point, index) => (
                  <tr key={`${point.quarter}-${index}`}>
                    <td>{point.quarter}</td>
                    <td>{showMeasure(point.value, "шт.")}</td>
                    <td>{point.value.source || "Не указан"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.presalesSeries} />
        )}
        <h3 className="subsection-title">Прогноз по кварталам</h3>
        {content.commercial.forecastSeries.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Период</th>
                  <th>Прогноз</th>
                  <th>Факт</th>
                  <th>Ключевой фактор</th>
                </tr>
              </thead>
              <tbody>
                {content.commercial.forecastSeries.map((point, index) => (
                  <tr key={`${point.quarter}-${index}`}>
                    <td>{point.quarter}</td>
                    <td>
                      {showMeasure(point.forecast, moneyUnitWithVat)}
                      <Source measure={point.forecast} />
                    </td>
                    <td>
                      {showMeasure(point.actual, moneyUnitWithVat)}
                      <Source measure={point.actual} />
                    </td>
                    <td>{point.factor}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.forecastSeries} />
        )}
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">КОММЕРЧЕСКИЕ РЕЗУЛЬТАТЫ</p>
            <h2>Выручка и прогноз</h2>
          </div>
          <div className="calculated-value">
            Выполнение плана
            <strong>
              {derived.quarterPlanCompletion === null
                ? "—"
                : `${derived.quarterPlanCompletion.toFixed(1)}%`}
            </strong>
          </div>
        </div>
        <div className="view-metrics">
          {[
            ["План года", revenue.annualPlan, moneyUnitWithVat],
            ["План квартала", revenue.quarterPlan, moneyUnitWithVat],
            ["Факт квартала", revenue.quarterActual, moneyUnitWithVat],
            ["Факт год назад", revenue.priorYearQuarterActual, moneyUnitWithVat],
            ["Прогноз года", revenue.yearForecast, moneyUnitWithVat],
          ].map(([label, value, unit]) => {
            const measure = value as Measure;
            return (
              <div key={label as string}>
                <span>{label as string}</span>
                <strong>{showMeasure(measure, unit as string)}</strong>
                <Source measure={measure} />
              </div>
            );
          })}
        </div>
        <div className="calculation-strip three-columns">
          <div>
            <span>Отклонение, сумма</span>
            <strong>
              {derived.quarterVarianceAmount === null
                ? "Нет данных"
                : `${derived.quarterVarianceAmount >= 0 ? "+" : ""}${number.format(
                    derived.quarterVarianceAmount,
                  )} ${moneyUnitWithVat}`}
            </strong>
          </div>
          <div>
            <span>Отклонение от плана</span>
            <strong>
              {derived.quarterVariance === null
                ? "Нет данных"
                : `${derived.quarterVariance >= 0 ? "+" : ""}${number.format(
                    derived.quarterVariance,
                  )}%`}
            </strong>
          </div>
          <div>
            <span>Изменение год к году</span>
            <strong>
              {derived.yearOverYearChange === null
                ? "Нет данных"
                : `${derived.yearOverYearChange >= 0 ? "+" : ""}${number.format(
                    derived.yearOverYearChange,
                  )}%`}
            </strong>
          </div>
        </div>
        <div className="executive-grid">
          <div>
            <span>Причина отклонения</span>
            <p>{revenue.varianceReason || "Не заполнено"}</p>
          </div>
          <div>
            <span>Корректирующие меры</span>
            <p>{revenue.correctiveAction || "Не заполнено"}</p>
            <small>
              {revenue.actionOwner || "Ответственный не указан"} ·{" "}
              {revenue.actionDueDate || "срок не указан"} ·{" "}
              {actionStatusLabels[revenue.actionStatus]}
            </small>
          </div>
          <div>
            <span>Фактор прогноза</span>
            <p>{revenue.forecastFactor || "Не заполнено"}</p>
          </div>
        </div>
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">КЛЮЧЕВЫЕ СДЕЛКИ</p>
            <h2>Pipeline</h2>
          </div>
        </div>
        {content.commercial.deals.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Заказчик</th>
                  <th>Предмет</th>
                  <th>Статус</th>
                  <th>Сумма с НДС</th>
                </tr>
              </thead>
              <tbody>
                {content.commercial.deals.map((deal, index) => (
                  <tr key={`${deal.customer}-${index}`}>
                    <td>{deal.customer}</td>
                    <td>{deal.subject}</td>
                    <td>{deal.status}</td>
                    <td>
                      {showMeasure(deal.amountVat, moneyUnitWithVat)}
                      <Source measure={deal.amountVat} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.deals} />
        )}
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">ВОРОНКА И ПОТЕРИ</p>
            <h2>Конверсии продаж</h2>
          </div>
          <div className="calculated-value">
            Потерянная выручка
            <strong>
              {derived.lostRevenue === null
                ? "Нет данных"
                : `${number.format(derived.lostRevenue)} ${moneyUnitWithVat}`}
            </strong>
          </div>
        </div>
        {content.commercial.funnelStages.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Этап</th>
                  <th>Активные</th>
                  <th>Следующий этап</th>
                  <th>Аннулированы</th>
                  <th>Итого</th>
                </tr>
              </thead>
              <tbody>
                {content.commercial.funnelStages.map((stage) => {
                  const totalKey =
                    stage.key === "LEADS"
                      ? "leads"
                      : stage.key === "SQL"
                        ? "sql"
                        : stage.key === "SQL_WITH_TASKS"
                          ? "sqlWithTasks"
                          : "won";
                  return (
                    <tr key={stage.key}>
                      <td><strong>{stage.label}</strong></td>
                      <td>{showMeasure(stage.active, "шт.")}</td>
                      <td>{showMeasure(stage.nextStage, "шт.")}</td>
                      <td>{showMeasure(stage.cancelled, "шт.")}</td>
                      <td>
                        {derived.funnelStageTotals[totalKey] === null
                          ? "Нет данных"
                          : `${number.format(
                              derived.funnelStageTotals[totalKey]!,
                            )} шт.`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : content.commercial.funnel.leads.state !== "MISSING" ? (
          <>
            <p className="context-note">
              Показаны исторические итоги. Разбивка по состояниям этапов еще не
              заполнена.
            </p>
            <div className="view-metrics compact-metrics">
              {(
                [
                  ["LEADS", content.commercial.funnel.leads],
                  ["SQL", content.commercial.funnel.qualified],
                  ["SQL с задачами", content.commercial.funnel.proposals],
                  ["Успешные сделки", content.commercial.funnel.won],
                ] as const
              ).map(([label, measure]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{showMeasure(measure, "шт.")}</strong>
                  <Source measure={measure} />
                </div>
              ))}
            </div>
          </>
        ) : (
          <EmptyCollection state={content.collectionStates.funnelStages} />
        )}
        <div className="calculation-strip">
          {(
            [
              ["leadToSql", "LEADS → SQL"],
              ["sqlToTasked", "SQL → SQL с задачами"],
              ["taskedToWon", "SQL с задачами → сделка"],
              ["leadToWon", "LEADS → сделка"],
              ["sqlToWon", "SQL → сделка"],
            ] as const
          ).map(([key, label]) => {
            const value = derived.funnelConversions[key];
            return (
              <div key={key}>
                <span>{label}</span>
                <strong>
                  {value === null ? "—" : `${value.toFixed(1)}%`}
                </strong>
                <small>
                  {content.commercial.funnelObservations[key] ||
                    "Наблюдение не заполнено"}
                </small>
              </div>
            );
          })}
        </div>
        {derived.lostReasons.length ? (
          <>
            <h3 className="subsection-title">Рейтинг причин потерь</h3>
            <div className="record-grid ranked-reasons">
              {derived.lostReasons.map((item, index) => (
                <article key={item.reason}>
                  <span>#{index + 1} · {item.count} сдел.</span>
                  <h3>{item.reason}</h3>
                  <p>
                    Потеря:{" "}
                    {item.amount === null
                      ? "нет данных"
                      : `${number.format(item.amount)} ${moneyUnitWithVat}`}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : null}
        {content.commercial.lostDeals.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Заказчик</th>
                  <th>Потеря</th>
                  <th>Причина</th>
                  <th>Системная проблема</th>
                </tr>
              </thead>
              <tbody>
                {content.commercial.lostDeals.map((deal, index) => (
                  <tr key={`${deal.customer}-${index}`}>
                    <td>{deal.customer}</td>
                    <td>
                      {showMeasure(deal.amount, moneyUnitWithVat)}
                      <Source measure={deal.amount} />
                    </td>
                    <td>{deal.reason}</td>
                    <td>{deal.systemicProblem}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.lostDeals} />
        )}
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">МАРКЕТИНГ</p>
            <h2>Цели, MQL и активности</h2>
          </div>
          <div className="calculated-value">
            MQL → SQL с задачами
            <strong>
              {derived.mqlToSqlWithTasks === null
                ? "—"
                : `${derived.mqlToSqlWithTasks.toFixed(1)}%`}
            </strong>
            <small>
              план {showMeasure(content.marketing.mqlToSqlWithTasksPlan, "%")}
            </small>
          </div>
        </div>
        <div className="view-metrics compact-metrics">
          <div>
            <span>MQL план</span>
            <strong>{showMeasure(content.marketing.mqlPlan, "шт.")}</strong>
            <Source measure={content.marketing.mqlPlan} />
          </div>
          <div>
            <span>MQL факт</span>
            <strong>{showMeasure(content.marketing.mqlActual, "шт.")}</strong>
            <Source measure={content.marketing.mqlActual} />
          </div>
          <div>
            <span>SQL факт</span>
            <strong>{showMeasure(content.marketing.sqlActual, "шт.")}</strong>
            <Source measure={content.marketing.sqlActual} />
          </div>
          <div>
            <span>SQL с задачами</span>
            <strong>
              {showMeasure(content.marketing.sqlWithTasksActual, "шт.")}
            </strong>
            <Source measure={content.marketing.sqlWithTasksActual} />
          </div>
          <div>
            <span>Сделки</span>
            <strong>{showMeasure(content.marketing.dealsActual, "шт.")}</strong>
            <Source measure={content.marketing.dealsActual} />
          </div>
        </div>
        <div className="calculation-strip">
          {(
            [
              ["mqlToSql", "MQL → SQL"],
              ["mqlToSqlWithTasks", "MQL → SQL с задачами"],
              ["sqlToSqlWithTasks", "SQL → SQL с задачами"],
              ["sqlTasksToDeal", "SQL с задачами → сделка"],
              ["mqlToDeal", "MQL → сделка"],
            ] as const
          ).map(([key, label]) => (
            <div key={key}>
              <span>{label}</span>
              <strong>{showPercent(derived[key])}</strong>
            </div>
          ))}
        </div>
        <p className="context-note">
          <b>Задачи по улучшению конверсии:</b>{" "}
          {content.marketing.conversionActions || "Не заполнено"}
        </p>
        {content.marketing.goals.length ? (
          <div className="record-grid">
            {content.marketing.goals.map((goal, index) => (
              <article key={`${goal.title}-${index}`}>
                <span>{goal.status} · {goal.progress}%</span>
                <h3>{goal.title}</h3>
                <p><b>Цель:</b> {goal.target}</p>
                <p><b>Результат:</b> {goal.result}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.marketingGoals} />
        )}
        <h3 className="subsection-title">План активностей</h3>
        {content.marketing.activities.length ? (
          <div className="record-grid">
            {content.marketing.activities.map((activity, index) => (
              <article key={`${activity.title}-${index}`}>
                <span>{activity.status} · {activity.owner}</span>
                <h3>{activity.title}</h3>
                <p>{activity.result}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection
            state={content.collectionStates.marketingActivities}
          />
        )}
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">ПРОДУКТ</p>
            <h2>Запуски, гипотезы и годовые цели</h2>
          </div>
        </div>
        <h3 className="subsection-title">Услуги и функции</h3>
        {content.product.launches.length ? (
          <div className="record-grid">
            {content.product.launches.map((launch, index) => (
              <article key={`${launch.title}-${index}`}>
                <span>
                  {launch.status} · план {launch.plannedDate || "—"} · факт{" "}
                  {launch.actualDate || "—"}
                </span>
                <h3>{launch.title}</h3>
                <p>{launch.result}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.launches} />
        )}
        <h3 className="subsection-title">Гипотезы</h3>
        {content.product.hypotheses.length ? (
          <div className="record-grid">
            {content.product.hypotheses.map((item, index) => (
              <article key={`${item.hypothesis}-${index}`}>
                <span>{item.status}</span>
                <h3>{item.hypothesis}</h3>
                <p><b>Метод:</b> {item.method}</p>
                <p><b>Вывод:</b> {item.result}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.hypotheses} />
        )}
        <h3 className="subsection-title">Годовые цели</h3>
        {content.product.annualGoals.length ? (
          <div className="record-grid">
            {content.product.annualGoals.map((goal, index) => (
              <article key={`${goal.title}-${index}`}>
                <span>{goal.status} · {goal.progress}%</span>
                <h3>{goal.title}</h3>
                <p>{goal.target}</p>
                <p>{goal.result}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.annualGoals} />
        )}
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">РЕСУРСЫ И РАСХОДЫ</p>
            <h2>Операционный контур</h2>
          </div>
          <div className="calculated-value">
            Расходы план / факт
            <strong>
              {derived.expensePlan === null
                ? "Нет данных"
                : number.format(derived.expensePlan)}{" "}
              /{" "}
              {derived.expenseActual === null
                ? "Нет данных"
                : number.format(derived.expenseActual)}{" "}
              {moneyUnit}
            </strong>
          </div>
        </div>
        {content.operations.resources.length ? (
          <div className="data-table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Роль</th>
                  <th>Емкость</th>
                  <th>Загрузка</th>
                  <th>Проблема</th>
                </tr>
              </thead>
              <tbody>
                {content.operations.resources.map((resource, index) => (
                  <tr key={`${resource.role}-${index}`}>
                    <td>{resource.role}</td>
                    <td>
                      {showMeasure(resource.capacity, "FTE")}
                      <Source measure={resource.capacity} />
                    </td>
                    <td>
                      {showMeasure(resource.load, "%")}
                      <Source measure={resource.load} />
                    </td>
                    <td>{resource.issue || "Проблем нет"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.resources} />
        )}
        <h3 className="subsection-title">Категории расходов</h3>
        {content.operations.expenses.length ? (
          <div className="record-grid">
            {content.operations.expenses.map((expense, index) => (
              <article key={`${expense.category}-${index}`}>
                <span>
                  План {showMeasure(expense.plan, moneyUnit)} · факт{" "}
                  {showMeasure(expense.actual, moneyUnit)}
                </span>
                <h3>{expense.category}</h3>
                <p>{expense.comment}</p>
                <Source measure={expense.plan} />
                <Source measure={expense.actual} />
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.expenses} />
        )}
      </section>

      <section className="report-view-section attention-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">РИСКИ И РЕШЕНИЯ</p>
            <h2>Требуется управленческая реакция</h2>
          </div>
        </div>
        {content.operations.risks.length ? (
          <div className="record-grid">
            {content.operations.risks.map((risk, index) => (
              <article key={`${risk.title}-${index}`}>
                <span>
                  {riskProbabilityLabels[risk.probability]} ·{" "}
                  {riskStatusLabels[risk.status]} · {risk.owner}
                </span>
                <h3>{risk.title}</h3>
                <p><b>Влияние:</b> {risk.impact}</p>
                <p><b>Меры:</b> {risk.mitigation}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.risks} />
        )}
        <h3 className="subsection-title">Запросы на решения</h3>
        {content.decisions.length ? (
          <div className="record-grid">
            {content.decisions.map((decision, index) => (
              <article key={`${decision.subject}-${index}`}>
                <span>{decisionCategoryLabels[decision.category]}</span>
                <h3>{decision.subject}</h3>
                <p><b>Сейчас:</b> {decision.currentState}</p>
                <p><b>Нужно:</b> {decision.requestedDecision}</p>
                <p><b>Эффект:</b> {decision.expectedImpact}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.decisions} />
        )}
      </section>

      <section className="report-view-section">
        <div className="view-section-head">
          <div>
            <p className="section-number">СЛЕДУЮЩИЙ КВАРТАЛ</p>
            <h2>Цели и ожидаемые результаты</h2>
          </div>
        </div>
        {content.nextQuarter.length ? (
          <div className="record-grid">
            {content.nextQuarter.map((item, index) => (
              <article key={`${item.goal}-${index}`}>
                <span>{item.owner} · до {item.dueDate || "—"}</span>
                <h3>{item.goal}</h3>
                <p><b>Мероприятия:</b> {item.actions}</p>
                <p><b>Результат:</b> {item.expectedResult}</p>
              </article>
            ))}
          </div>
        ) : (
          <EmptyCollection state={content.collectionStates.nextQuarter} />
        )}
      </section>

      <section className="report-view-section contact-section">
        <div>
          <p className="section-number">КОНТАКТЫ И ОБЛАСТЬ ОТЧЕТА</p>
          <h2>{content.context.productOwner || "Владелец не указан"}</h2>
          <p>{content.context.productMarketer || "Маркетолог не указан"}</p>
        </div>
        <div>
          <strong>{content.context.contactEmail || "Почта не указана"}</strong>
          <p>{content.context.contactPhone || "Телефон не указан"}</p>
          <p>{moneyUnit} · {vatLabel}</p>
          <small>{content.context.reportScope || "Область отчета не описана"}</small>
        </div>
      </section>
    </div>
  );
}
