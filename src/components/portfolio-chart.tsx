"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function PortfolioChart({
  data,
}: {
  data: Array<{ name: string; plan: number | null; actual: number | null }>;
}) {
  return (
    <div
      className="chart-wrap"
      role="img"
      aria-label="Сравнение плана и факта выручки по продуктам в миллионах рублей. Точные значения доступны в таблице направлений ниже."
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barGap={5}>
          <CartesianGrid stroke="#eeece7" vertical={false} />
          <XAxis
            dataKey="name"
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#70706c", fontSize: 11 }}
          />
          <YAxis
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#85857f", fontSize: 10 }}
            tickFormatter={(value) => `${value}M`}
          />
          <Tooltip
            cursor={{ fill: "#f5f3ee" }}
            contentStyle={{
              border: "1px solid #e7e4de",
              borderRadius: 8,
              boxShadow: "0 8px 25px rgba(0,0,0,.08)",
            }}
            formatter={(value) => [`${Number(value).toFixed(1)} млн ₽`]}
          />
          <Bar dataKey="plan" name="План" fill="#c9c6bf" radius={[3, 3, 0, 0]} />
          <Bar dataKey="actual" name="Факт" fill="#e95b26" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
