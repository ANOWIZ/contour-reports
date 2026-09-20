"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { QuarterlyTrends } from "@/modules/reports/trends";

const number = new Intl.NumberFormat("ru-RU", {
  maximumFractionDigits: 1,
});

const qoqReasonLabel = {
  NOT_ENOUGH_PERIODS: "Для сравнения нужны два опубликованных квартала.",
  NO_COMPARABLE_PRODUCTS:
    "Нет продуктов с фактом выручки в обоих соседних кварталах.",
  MISSING_MONEY_UNIT: "Не указана единица денежных показателей.",
  MONEY_MODE_MISMATCH:
    "Кварталы нельзя сравнить: различаются единицы или режим учета НДС.",
  ZERO_PREVIOUS_ACTUAL: "Предыдущий факт равен нулю, процент не рассчитывается.",
} as const;

function show(value: number | null, suffix = "") {
  return value === null ? "Нет данных" : `${number.format(value)}${suffix}`;
}

export function PortfolioTrends({ trends }: { trends: QuarterlyTrends }) {
  const data = trends.points.map((point) => ({
    period: point.periodLabel,
    plan: point.revenue.plan,
    actual: point.revenue.actual,
  }));
  const mode = trends.points
    .map((point) => point.revenue.moneyMode)
    .find((item) => item !== null);
  const unit = mode?.moneyUnit ?? "";
  const qoq = trends.revenueQoq;

  return (
    <section className="surface portfolio-trends">
      <div className="surface-head">
        <div>
          <p className="section-number">ДИНАМИКА</p>
          <h2>Четыре квартала</h2>
          <p className="subtle">
            Только опубликованные версии; покрытие показано рядом с каждым
            значением.
          </p>
        </div>
        <div className="trend-qoq" aria-label="Изменение квартал к кварталу">
          <span>QoQ, сопоставимый состав</span>
          <strong>
            {qoq.reason
              ? "Не рассчитано"
              : `${(qoq.changePercent ?? 0) >= 0 ? "+" : ""}${show(
                  qoq.changePercent,
                  "%",
                )}`}
          </strong>
          <small>
            {qoq.reason
              ? qoqReasonLabel[qoq.reason]
              : `${qoq.comparedProducts} продуктов · ${show(
                  qoq.changeAmount,
                  unit ? ` ${unit}` : "",
                )}`}
          </small>
        </div>
      </div>

      {trends.points.length ? (
        <>
          <div
            className="trend-chart"
            role="img"
            aria-label="Динамика плана и факта выручки по опубликованным квартальным отчетам. Точные значения доступны в таблице ниже."
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: 0, right: 12, top: 12 }}>
                <CartesianGrid stroke="#eeece7" vertical={false} />
                <XAxis
                  dataKey="period"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#70706c", fontSize: 11 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#85857f", fontSize: 10 }}
                />
                <Tooltip
                  contentStyle={{
                    border: "1px solid #e7e4de",
                    borderRadius: 8,
                  }}
                  formatter={(value) => [
                    `${number.format(Number(value))}${unit ? ` ${unit}` : ""}`,
                  ]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="plan"
                  name="План"
                  stroke="#9e9a91"
                  strokeWidth={2}
                  connectNulls={false}
                />
                <Line
                  type="monotone"
                  dataKey="actual"
                  name="Факт"
                  stroke="#e95b26"
                  strokeWidth={3}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="data-table-wrap trend-table-wrap">
            <table className="portfolio-table">
              <caption className="sr-only">
                Точные квартальные значения и покрытие данных
              </caption>
              <thead>
                <tr>
                  <th>Период</th>
                  <th>Выручка факт / план</th>
                  <th>MQL → SQL</th>
                  <th>Риски высокий / средний</th>
                  <th>Опубликовано</th>
                </tr>
              </thead>
              <tbody>
                {trends.points.map((point) => (
                  <tr key={point.periodId}>
                    <td>
                      <strong>{point.periodLabel}</strong>
                    </td>
                    <td>
                      {show(point.revenue.actual, unit ? ` ${unit}` : "")} /{" "}
                      {show(point.revenue.plan, unit ? ` ${unit}` : "")}
                      <small className="table-meta">
                        факт: {point.coverage.revenueActual.available} из{" "}
                        {point.coverage.products}
                      </small>
                    </td>
                    <td>
                      {show(point.weightedMqlToSql, "%")}
                      <small className="table-meta">
                        {point.coverage.mqlToSql.available} из{" "}
                        {point.coverage.products}
                      </small>
                    </td>
                    <td>
                      {point.risks.high} / {point.risks.medium}
                      <small className="table-meta">
                        {point.coverage.risks.available} из{" "}
                        {point.coverage.products}
                      </small>
                    </td>
                    <td>
                      {point.coverage.published} из {point.coverage.products}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="empty-inline trend-empty">
          Опубликованных квартальных версий пока нет.
        </p>
      )}
    </section>
  );
}
