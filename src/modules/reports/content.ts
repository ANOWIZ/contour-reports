import { z } from "zod";

export const dataStateSchema = z.enum(["VALUE", "MISSING", "NOT_APPLICABLE"]);
export type DataState = z.infer<typeof dataStateSchema>;

export const collectionStateSchema = z.enum([
  "MISSING",
  "ZERO",
  "NOT_APPLICABLE",
]);
export type CollectionState = z.infer<typeof collectionStateSchema>;

export const measureSchema = z
  .object({
    state: dataStateSchema,
    value: z.number().finite().nullable(),
    source: z.string().max(200).default("Ручной ввод"),
  })
  .superRefine((measure, context) => {
    if (measure.state === "VALUE" && measure.value === null) {
      context.addIssue({
        code: "custom",
        message: "Для состояния «Есть данные» требуется значение.",
        path: ["value"],
      });
    }
    if (measure.state !== "VALUE" && measure.value !== null) {
      context.addIssue({
        code: "custom",
        message: "Для отсутствующих или неприменимых данных значение не задается.",
        path: ["value"],
      });
    }
    if (measure.state === "VALUE" && (measure.value ?? 0) < 0) {
      context.addIssue({
        code: "custom",
        message: "Значение не может быть отрицательным.",
        path: ["value"],
      });
    }
    if (measure.state === "VALUE" && !measure.source.trim()) {
      context.addIssue({
        code: "custom",
        message: "Укажите источник значения.",
        path: ["source"],
      });
    }
  });

export type Measure = z.infer<typeof measureSchema>;

const percentageMeasureSchema = measureSchema.superRefine(
  (measure, context) => {
    if (
      measure.state === "VALUE" &&
      measure.value !== null &&
      measure.value > 100
    ) {
      context.addIssue({
        code: "custom",
        message: "Процент не может быть больше 100.",
        path: ["value"],
      });
    }
  },
);

const text = (length = 2000) => z.string().max(length);
const missingMeasureDefault = {
  state: "MISSING" as const,
  value: null,
  source: "",
};

const dealSchema = z.object({
  customer: text(300),
  subject: text(500),
  status: text(120),
  amountVat: measureSchema,
});

const lostDealSchema = z.object({
  customer: text(300),
  amount: measureSchema,
  reason: text(500),
  systemicProblem: text(1000),
});

const goalSchema = z.object({
  title: text(500),
  target: text(500),
  result: text(1000),
  progress: z.number().min(0).max(100),
  status: text(120),
});

const activitySchema = z.object({
  title: text(500),
  status: text(120),
  result: text(1000),
  owner: text(200),
});

const launchSchema = z.object({
  title: text(500),
  status: text(120),
  plannedDate: text(40),
  actualDate: text(40),
  result: text(1000),
});

const hypothesisSchema = z.object({
  hypothesis: text(1000),
  method: text(1000),
  status: text(120),
  result: text(1000),
});

const resourceSchema = z.object({
  role: text(200),
  capacity: measureSchema,
  load: percentageMeasureSchema,
  issue: text(1000),
});

const expenseSchema = z.object({
  category: text(300),
  plan: measureSchema,
  actual: measureSchema,
  comment: text(1000),
});

const riskSchema = z.object({
  title: text(500),
  probability: z.enum(["LOW", "MEDIUM", "HIGH"]),
  impact: text(1000),
  mitigation: text(1000),
  owner: text(200),
  status: z.enum(["OPEN", "WATCH", "CLOSED"]),
});

export const decisionCategorySchema = z.enum([
  "ACTIVITIES",
  "TARGETS",
  "RESOURCES",
  "PRIORITIES",
  "OTHER",
]);
export type DecisionCategory = z.infer<typeof decisionCategorySchema>;

const decisionSchema = z.object({
  category: decisionCategorySchema.default("OTHER"),
  subject: text(500),
  currentState: text(1000),
  requestedDecision: text(1000),
  expectedImpact: text(1000),
});

const nextQuarterItemSchema = z.object({
  goal: text(500),
  actions: text(1000),
  expectedResult: text(1000),
  owner: text(200),
  dueDate: text(40),
});

export const funnelStageKeySchema = z.enum([
  "LEADS",
  "SQL",
  "SQL_WITH_TASKS",
  "WON",
]);

const funnelStageSchema = z.object({
  key: funnelStageKeySchema,
  label: text(120),
  active: measureSchema,
  nextStage: measureSchema,
  cancelled: measureSchema,
});

export const collectionKeys = [
  "forecastSeries",
  "presalesSeries",
  "deals",
  "funnelStages",
  "lostDeals",
  "marketingGoals",
  "marketingActivities",
  "launches",
  "hypotheses",
  "annualGoals",
  "resources",
  "expenses",
  "risks",
  "decisions",
  "nextQuarter",
] as const;

const collectionStatesSchema = z.object({
  forecastSeries: collectionStateSchema.default("MISSING"),
  presalesSeries: collectionStateSchema.default("MISSING"),
  deals: collectionStateSchema.default("MISSING"),
  funnelStages: collectionStateSchema.default("MISSING"),
  lostDeals: collectionStateSchema.default("MISSING"),
  marketingGoals: collectionStateSchema.default("MISSING"),
  marketingActivities: collectionStateSchema.default("MISSING"),
  launches: collectionStateSchema.default("MISSING"),
  hypotheses: collectionStateSchema.default("MISSING"),
  annualGoals: collectionStateSchema.default("MISSING"),
  resources: collectionStateSchema.default("MISSING"),
  expenses: collectionStateSchema.default("MISSING"),
  risks: collectionStateSchema.default("MISSING"),
  decisions: collectionStateSchema.default("MISSING"),
  nextQuarter: collectionStateSchema.default("MISSING"),
});

export const fullReportContentSchema = z.object({
  provenance: z
    .object({
      copiedFromReportId: text(100),
      copiedFromPeriodLabel: text(120),
      copiedAt: z.string().datetime(),
      copiedSections: z
        .array(z.enum(["CONTEXT", "ANNUAL_GOALS", "OPEN_RISKS"]))
        .max(3),
    })
    .nullable()
    .default(null),
  context: z.object({
    productOwner: text(200),
    productMarketer: text(200),
    contactEmail: z.string().email().or(z.literal("")),
    contactPhone: text(80),
    reportScope: text(1000),
    moneyUnit: text(40).default("млн ₽"),
    vatTreatment: z
      .enum(["INCLUDED", "EXCLUDED", "MIXED"])
      .default("INCLUDED"),
  }),
  summary: z.object({
    quarterResult: text(2000),
    mainProblems: text(2000),
    mainRisk: text(1000),
    requestedAttention: text(1000),
  }),
  commercial: z.object({
    revenue: z.object({
      annualPlan: measureSchema,
      quarterPlan: measureSchema,
      quarterActual: measureSchema,
      priorYearQuarterActual: measureSchema,
      yearForecast: measureSchema,
      varianceReason: text(2000),
      correctiveAction: text(2000),
      actionOwner: text(200).default(""),
      actionDueDate: text(40).default(""),
      actionStatus: z
        .enum(["PLANNED", "IN_PROGRESS", "DONE", "BLOCKED"])
        .default("PLANNED"),
      forecastFactor: text(1000),
    }),
    forecastSeries: z
      .array(
        z.object({
          quarter: text(40),
          forecast: measureSchema,
          actual: measureSchema,
          factor: text(1000),
        }),
      )
      .max(12),
    presales: z.object({
      plan: measureSchema,
      actual: measureSchema,
      comment: text(1000),
      series: z
        .array(
          z.object({
            quarter: text(40),
            value: measureSchema,
          }),
        )
        .max(12)
        .default([]),
    }),
    deals: z.array(dealSchema).max(50),
    funnel: z.object({
      leads: measureSchema,
      qualified: measureSchema,
      proposals: measureSchema,
      won: measureSchema,
      cancelled: measureSchema,
    }),
    funnelStages: z.array(funnelStageSchema).max(12).default([]),
    funnelObservations: z
      .object({
        leadToSql: text(1000).default(""),
        sqlToTasked: text(1000).default(""),
        taskedToWon: text(1000).default(""),
        leadToWon: text(1000).default(""),
        sqlToWon: text(1000).default(""),
      })
      .default({
        leadToSql: "",
        sqlToTasked: "",
        taskedToWon: "",
        leadToWon: "",
        sqlToWon: "",
      }),
    lostDeals: z.array(lostDealSchema).max(50),
  }),
  marketing: z.object({
    mqlPlan: measureSchema,
    mqlActual: measureSchema,
    sqlActual: measureSchema,
    sqlWithTasksActual: measureSchema.default(missingMeasureDefault),
    dealsActual: measureSchema.default(missingMeasureDefault),
    mqlToSqlWithTasksPlan: percentageMeasureSchema.default(
      missingMeasureDefault,
    ),
    conversionActions: text(1500),
    goals: z.array(goalSchema).max(30),
    activities: z.array(activitySchema).max(50),
  }),
  product: z.object({
    launches: z.array(launchSchema).max(50),
    hypotheses: z.array(hypothesisSchema).max(50),
    annualGoals: z.array(goalSchema).max(30),
  }),
  operations: z.object({
    resources: z.array(resourceSchema).max(30),
    expenses: z.array(expenseSchema).max(30),
    risks: z.array(riskSchema).max(30),
  }),
  decisions: z.array(decisionSchema).max(30),
  nextQuarter: z.array(nextQuarterItemSchema).max(30),
  collectionStates: collectionStatesSchema.default({
    forecastSeries: "MISSING",
    presalesSeries: "MISSING",
    deals: "MISSING",
    funnelStages: "MISSING",
    lostDeals: "MISSING",
    marketingGoals: "MISSING",
    marketingActivities: "MISSING",
    launches: "MISSING",
    hypotheses: "MISSING",
    annualGoals: "MISSING",
    resources: "MISSING",
    expenses: "MISSING",
    risks: "MISSING",
    decisions: "MISSING",
    nextQuarter: "MISSING",
  }),
}).superRefine((content, context) => {
  const stages = content.commercial.funnelStages;
  if (!stages.length) return;

  const expectedKeys = ["LEADS", "SQL", "SQL_WITH_TASKS", "WON"] as const;
  for (const key of expectedKeys) {
    if (stages.filter((stage) => stage.key === key).length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Воронка должна содержать каждый этап ровно один раз.",
        path: ["commercial", "funnelStages"],
      });
      return;
    }
  }

  const totals = expectedKeys.map((key) => {
    const stage = stages.find((item) => item.key === key)!;
    const measures = [stage.active, stage.nextStage, stage.cancelled];
    if (measures.some((measure) => measure.state === "MISSING")) return null;
    const values = measures
      .filter((measure) => measure.state === "VALUE")
      .map((measure) => measure.value ?? 0);
    return values.length
      ? values.reduce((sum, value) => sum + value, 0)
      : null;
  });

  for (let index = 1; index < totals.length; index += 1) {
    const previous = totals[index - 1];
    const current = totals[index];
    if (previous !== null && current !== null && current > previous) {
      context.addIssue({
        code: "custom",
        message:
          "Количество на следующем этапе не может превышать предыдущий этап.",
        path: ["commercial", "funnelStages", index],
      });
    }
  }
});

export type FullReportContent = z.infer<typeof fullReportContentSchema>;

export const valueMeasure = (
  value: number,
  source = "Ручной ввод",
): Measure => ({ state: "VALUE", value, source });

export const missingMeasure = (source = ""): Measure => ({
  state: "MISSING",
  value: null,
  source,
});

export const notApplicableMeasure = (source = ""): Measure => ({
  state: "NOT_APPLICABLE",
  value: null,
  source,
});

export const defaultFunnelStages = (): FullReportContent["commercial"]["funnelStages"] => [
  {
    key: "LEADS",
    label: "LEADS",
    active: missingMeasure(),
    nextStage: missingMeasure(),
    cancelled: missingMeasure(),
  },
  {
    key: "SQL",
    label: "SQL",
    active: missingMeasure(),
    nextStage: missingMeasure(),
    cancelled: missingMeasure(),
  },
  {
    key: "SQL_WITH_TASKS",
    label: "SQL с задачами",
    active: missingMeasure(),
    nextStage: missingMeasure(),
    cancelled: missingMeasure(),
  },
  {
    key: "WON",
    label: "Успешная сделка",
    active: missingMeasure(),
    nextStage: notApplicableMeasure("Финальный этап"),
    cancelled: notApplicableMeasure("Финальный этап"),
  },
];

export const defaultCollectionStates: FullReportContent["collectionStates"] = {
  forecastSeries: "MISSING",
  presalesSeries: "MISSING",
  deals: "MISSING",
  funnelStages: "MISSING",
  lostDeals: "MISSING",
  marketingGoals: "MISSING",
  marketingActivities: "MISSING",
  launches: "MISSING",
  hypotheses: "MISSING",
  annualGoals: "MISSING",
  resources: "MISSING",
  expenses: "MISSING",
  risks: "MISSING",
  decisions: "MISSING",
  nextQuarter: "MISSING",
};

export const defaultFullReportContent: FullReportContent = {
  provenance: null,
  context: {
    productOwner: "",
    productMarketer: "",
    contactEmail: "",
    contactPhone: "",
    reportScope: "",
    moneyUnit: "млн ₽",
    vatTreatment: "INCLUDED",
  },
  summary: {
    quarterResult: "",
    mainProblems: "",
    mainRisk: "",
    requestedAttention: "",
  },
  commercial: {
    revenue: {
      annualPlan: missingMeasure(),
      quarterPlan: missingMeasure(),
      quarterActual: missingMeasure(),
      priorYearQuarterActual: missingMeasure(),
      yearForecast: missingMeasure(),
      varianceReason: "",
      correctiveAction: "",
      actionOwner: "",
      actionDueDate: "",
      actionStatus: "PLANNED",
      forecastFactor: "",
    },
    forecastSeries: [],
    presales: {
      plan: missingMeasure(),
      actual: missingMeasure(),
      comment: "",
      series: [],
    },
    deals: [],
    funnel: {
      leads: missingMeasure(),
      qualified: missingMeasure(),
      proposals: missingMeasure(),
      won: missingMeasure(),
      cancelled: missingMeasure(),
    },
    funnelStages: [],
    funnelObservations: {
      leadToSql: "",
      sqlToTasked: "",
      taskedToWon: "",
      leadToWon: "",
      sqlToWon: "",
    },
    lostDeals: [],
  },
  marketing: {
    mqlPlan: missingMeasure(),
    mqlActual: missingMeasure(),
    sqlActual: missingMeasure(),
    sqlWithTasksActual: missingMeasure(),
    dealsActual: missingMeasure(),
    mqlToSqlWithTasksPlan: missingMeasure(),
    conversionActions: "",
    goals: [],
    activities: [],
  },
  product: {
    launches: [],
    hypotheses: [],
    annualGoals: [],
  },
  operations: {
    resources: [],
    expenses: [],
    risks: [],
  },
  decisions: [],
  nextQuarter: [],
  collectionStates: structuredClone(defaultCollectionStates),
};

export function parseReportContent(value: unknown): FullReportContent {
  const parsed = fullReportContentSchema.safeParse(value);
  return parsed.success ? parsed.data : structuredClone(defaultFullReportContent);
}

export function measureNumber(measure: Measure) {
  return measure.state === "VALUE" ? measure.value : null;
}

export function ratio(numerator: Measure, denominator: Measure) {
  const top = measureNumber(numerator);
  const bottom = measureNumber(denominator);
  if (top === null || bottom === null || bottom === 0) return null;
  return (top / bottom) * 100;
}

function strictMeasureTotal(measures: Measure[]) {
  if (measures.some((measure) => measure.state === "MISSING")) return null;
  const values = measures
    .filter((measure) => measure.state === "VALUE")
    .map((measure) => measure.value)
    .filter((value): value is number => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

function collectionMeasureTotal(
  measures: Measure[],
  state: CollectionState,
) {
  if (!measures.length) return state === "ZERO" ? 0 : null;
  return strictMeasureTotal(measures);
}

export function collectionStateLabel(state: CollectionState) {
  return (
    {
      MISSING: "Состояние не указано",
      ZERO: "Событий за период не было",
      NOT_APPLICABLE: "Раздел не применим к продукту",
    } satisfies Record<CollectionState, string>
  )[state];
}

export function collectionIsComplete(
  records: unknown[],
  state: CollectionState,
  validate: (record: unknown) => boolean = () => true,
) {
  return records.length > 0
    ? records.every(validate)
    : state !== "MISSING";
}

function stageTotal(
  stages: FullReportContent["commercial"]["funnelStages"],
  key: z.infer<typeof funnelStageKeySchema>,
) {
  const stage = stages.find((item) => item.key === key);
  return stage
    ? strictMeasureTotal([stage.active, stage.nextStage, stage.cancelled])
    : null;
}

export function sumAvailableMeasures(measures: Measure[]) {
  const values = measures
    .filter((measure) => measure.state === "VALUE" && measure.value !== null)
    .map((measure) => measure.value as number);
  return {
    value: values.length
      ? values.reduce((sum, value) => sum + value, 0)
      : null,
    valueCount: values.length,
    missingCount: measures.filter((measure) => measure.state === "MISSING")
      .length,
    notApplicableCount: measures.filter(
      (measure) => measure.state === "NOT_APPLICABLE",
    ).length,
    totalCount: measures.length,
  };
}

export function reportDerived(content: FullReportContent) {
  const revenue = content.commercial.revenue;
  const quarterActual = measureNumber(revenue.quarterActual);
  const quarterPlan = measureNumber(revenue.quarterPlan);
  const priorYearQuarterActual = measureNumber(
    revenue.priorYearQuarterActual,
  );
  const quarterVariance = ratio(
    {
      state: revenue.quarterActual.state,
      value:
        revenue.quarterActual.value !== null &&
        revenue.quarterPlan.value !== null
          ? revenue.quarterActual.value - revenue.quarterPlan.value
          : null,
      source: "Расчет системы",
    },
    revenue.quarterPlan,
  );

  const hasStructuredFunnel = content.commercial.funnelStages.length > 0;
  const stageTotals = hasStructuredFunnel
    ? {
        leads: stageTotal(content.commercial.funnelStages, "LEADS"),
        sql: stageTotal(content.commercial.funnelStages, "SQL"),
        sqlWithTasks: stageTotal(
          content.commercial.funnelStages,
          "SQL_WITH_TASKS",
        ),
        won: stageTotal(content.commercial.funnelStages, "WON"),
      }
    : {
        leads: measureNumber(content.commercial.funnel.leads),
        sql: measureNumber(content.commercial.funnel.qualified),
        sqlWithTasks: measureNumber(content.commercial.funnel.proposals),
        won: measureNumber(content.commercial.funnel.won),
      };
  const ratioValues = (top: number | null, bottom: number | null) =>
    top === null || bottom === null || bottom === 0
      ? null
      : (top / bottom) * 100;

  const lostReasonMap = new Map<
    string,
    { reason: string; count: number; measures: Measure[] }
  >();
  for (const deal of content.commercial.lostDeals) {
    const reason = deal.reason.trim() || "Причина не указана";
    const current = lostReasonMap.get(reason) ?? {
      reason,
      count: 0,
      measures: [],
    };
    current.count += 1;
    current.measures.push(deal.amount);
    lostReasonMap.set(reason, current);
  }

  return {
    quarterPlanCompletion: ratio(revenue.quarterActual, revenue.quarterPlan),
    quarterVariance,
    quarterVarianceAmount:
      quarterActual !== null && quarterPlan !== null
        ? quarterActual - quarterPlan
        : null,
    yearOverYearChange:
      quarterActual !== null &&
      priorYearQuarterActual !== null &&
      priorYearQuarterActual !== 0
        ? ((quarterActual - priorYearQuarterActual) /
            Math.abs(priorYearQuarterActual)) *
          100
        : null,
    yearForecastCompletion: ratio(revenue.yearForecast, revenue.annualPlan),
    presalesCompletion: ratio(
      content.commercial.presales.actual,
      content.commercial.presales.plan,
    ),
    funnelStageTotals: stageTotals,
    funnelConversions: {
      leadToSql: ratioValues(stageTotals.sql, stageTotals.leads),
      sqlToTasked: ratioValues(stageTotals.sqlWithTasks, stageTotals.sql),
      taskedToWon: ratioValues(stageTotals.won, stageTotals.sqlWithTasks),
      leadToWon: ratioValues(stageTotals.won, stageTotals.leads),
      sqlToWon: ratioValues(stageTotals.won, stageTotals.sql),
    },
    mqlToSql: ratio(content.marketing.sqlActual, content.marketing.mqlActual),
    mqlToSqlWithTasks: ratio(
      content.marketing.sqlWithTasksActual,
      content.marketing.mqlActual,
    ),
    sqlToSqlWithTasks: ratio(
      content.marketing.sqlWithTasksActual,
      content.marketing.sqlActual,
    ),
    sqlTasksToDeal: ratio(
      content.marketing.dealsActual,
      content.marketing.sqlWithTasksActual,
    ),
    mqlToDeal: ratio(
      content.marketing.dealsActual,
      content.marketing.mqlActual,
    ),
    mqlToSqlWithTasksPlan: measureNumber(
      content.marketing.mqlToSqlWithTasksPlan,
    ),
    expensePlan: collectionMeasureTotal(
      content.operations.expenses.map((expense) => expense.plan),
      content.collectionStates.expenses,
    ),
    expenseActual: collectionMeasureTotal(
      content.operations.expenses.map((expense) => expense.actual),
      content.collectionStates.expenses,
    ),
    lostRevenue: collectionMeasureTotal(
      content.commercial.lostDeals.map((deal) => deal.amount),
      content.collectionStates.lostDeals,
    ),
    lostReasons: [...lostReasonMap.values()]
      .map((item) => ({
        reason: item.reason,
        count: item.count,
        amount: strictMeasureTotal(item.measures),
      }))
      .sort((left, right) => right.count - left.count),
  };
}

export const reportSectionKeys = [
  "context",
  "summary",
  "commercial",
  "marketing",
  "product",
  "operations",
  "decisions",
  "nextQuarter",
] as const;

export function reportCompleteness(content: FullReportContent) {
  const hasText = (value: string) => value.trim().length > 0;
  const measureProvided = (measure: Measure) => measure.state !== "MISSING";
  const completeCollection = <T>(
    records: T[],
    state: CollectionState,
    validate: (record: T) => boolean,
  ) =>
    collectionIsComplete(
      records,
      state,
      (record) => validate(record as T),
    );

  const checks = {
    summary: Boolean(
      hasText(content.context.productOwner) &&
        hasText(content.context.productMarketer) &&
        hasText(content.context.contactEmail) &&
        hasText(content.context.reportScope) &&
        hasText(content.summary.quarterResult) &&
        hasText(content.summary.mainProblems) &&
        hasText(content.summary.mainRisk),
    ),
    commercial:
      measureProvided(content.commercial.revenue.annualPlan) &&
      measureProvided(content.commercial.revenue.quarterPlan) &&
      measureProvided(content.commercial.revenue.quarterActual) &&
      measureProvided(content.commercial.revenue.priorYearQuarterActual) &&
      measureProvided(content.commercial.revenue.yearForecast) &&
      hasText(content.commercial.revenue.varianceReason) &&
      hasText(content.commercial.revenue.correctiveAction) &&
      hasText(content.commercial.revenue.actionOwner) &&
      hasText(content.commercial.revenue.actionDueDate) &&
      hasText(content.commercial.revenue.forecastFactor) &&
      measureProvided(content.commercial.presales.plan) &&
      measureProvided(content.commercial.presales.actual) &&
      completeCollection(
        content.commercial.presales.series,
        content.collectionStates.presalesSeries,
        (point) => hasText(point.quarter) && measureProvided(point.value),
      ) &&
      completeCollection(
        content.commercial.forecastSeries,
        content.collectionStates.forecastSeries,
        (point) =>
          hasText(point.quarter) &&
          measureProvided(point.forecast) &&
          hasText(point.factor),
      ) &&
      completeCollection(
        content.commercial.deals,
        content.collectionStates.deals,
        (deal) =>
          hasText(deal.customer) &&
          hasText(deal.subject) &&
          hasText(deal.status) &&
          measureProvided(deal.amountVat),
      ) &&
      completeCollection(
        content.commercial.funnelStages,
        content.collectionStates.funnelStages,
        (stage) =>
          hasText(stage.label) &&
          measureProvided(stage.active) &&
          measureProvided(stage.nextStage) &&
          measureProvided(stage.cancelled),
      ) &&
      Object.values(content.commercial.funnelObservations).every(hasText) &&
      completeCollection(
        content.commercial.lostDeals,
        content.collectionStates.lostDeals,
        (deal) =>
          hasText(deal.reason) &&
          hasText(deal.systemicProblem) &&
          measureProvided(deal.amount),
      ),
    marketing:
      completeCollection(
        content.marketing.goals,
        content.collectionStates.marketingGoals,
        (goal) =>
          hasText(goal.title) &&
          hasText(goal.target) &&
          hasText(goal.result) &&
          hasText(goal.status),
      ) &&
      completeCollection(
        content.marketing.activities,
        content.collectionStates.marketingActivities,
        (activity) =>
          hasText(activity.title) &&
          hasText(activity.status) &&
          hasText(activity.result),
      ) &&
      measureProvided(content.marketing.mqlPlan) &&
      measureProvided(content.marketing.mqlActual) &&
      measureProvided(content.marketing.sqlActual) &&
      measureProvided(content.marketing.sqlWithTasksActual) &&
      measureProvided(content.marketing.dealsActual) &&
      measureProvided(content.marketing.mqlToSqlWithTasksPlan) &&
      hasText(content.marketing.conversionActions),
    product:
      completeCollection(
        content.product.launches,
        content.collectionStates.launches,
        (launch) =>
          hasText(launch.title) &&
          hasText(launch.status) &&
          hasText(launch.plannedDate) &&
          hasText(launch.result),
      ) &&
      completeCollection(
        content.product.hypotheses,
        content.collectionStates.hypotheses,
        (hypothesis) =>
          hasText(hypothesis.hypothesis) &&
          hasText(hypothesis.method) &&
          hasText(hypothesis.status) &&
          hasText(hypothesis.result),
      ) &&
      completeCollection(
        content.product.annualGoals,
        content.collectionStates.annualGoals,
        (goal) =>
          hasText(goal.title) &&
          hasText(goal.status) &&
          hasText(goal.result),
      ),
    operations:
      completeCollection(
        content.operations.resources,
        content.collectionStates.resources,
        (resource) =>
          hasText(resource.role) &&
          measureProvided(resource.capacity) &&
          measureProvided(resource.load),
      ) &&
      completeCollection(
        content.operations.expenses,
        content.collectionStates.expenses,
        (expense) =>
          hasText(expense.category) &&
          measureProvided(expense.plan) &&
          measureProvided(expense.actual),
      ) &&
      completeCollection(
        content.operations.risks,
        content.collectionStates.risks,
        (risk) =>
          hasText(risk.title) &&
          hasText(risk.impact) &&
          hasText(risk.mitigation) &&
          hasText(risk.owner),
      ),
    decisions: completeCollection(
      content.decisions,
      content.collectionStates.decisions,
      (decision) =>
        hasText(decision.subject) &&
        hasText(decision.currentState) &&
        hasText(decision.requestedDecision) &&
        hasText(decision.expectedImpact),
    ),
    nextQuarter:
      content.nextQuarter.length > 0 &&
      content.nextQuarter.every(
        (item) =>
          hasText(item.goal) &&
          hasText(item.actions) &&
          hasText(item.expectedResult) &&
          hasText(item.owner),
      ),
  } as const;
  const values = Object.values(checks);

  return {
    completed: values.filter(Boolean).length,
    total: values.length,
    percent: Math.round((values.filter(Boolean).length / values.length) * 100),
    sections: checks,
  };
}
