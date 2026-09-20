import {
  measureNumber,
  type DataState,
  type FullReportContent,
} from "./content";

export type TrendMoneyMode = {
  moneyUnit: string;
  vatTreatment: FullReportContent["context"]["vatTreatment"];
};

export type PublishedReportTrendSnapshot = {
  reportId: string;
  productId: string;
  versionNumber: number;
  content: FullReportContent;
};

export type PublishedQuarterTrendInput = {
  periodId: string;
  periodLabel: string;
  year: number;
  quarter: number;
  /**
   * The complete product cohort for this period. Products without a published
   * snapshot remain visible in coverage as missing.
   */
  productIds: readonly string[];
  snapshots: readonly PublishedReportTrendSnapshot[];
};

export type TrendMetricCoverage = {
  available: number;
  missing: number;
  notApplicable: number;
  total: number;
};

export type TrendRevenueUnavailableReason =
  | "MISSING_MONEY_UNIT"
  | "MIXED_MONEY_MODE";

export type QuarterlyTrendPoint = {
  periodId: string;
  periodLabel: string;
  year: number;
  quarter: number;
  revenue: {
    actual: number | null;
    plan: number | null;
    moneyMode: TrendMoneyMode | null;
    unavailableReason: TrendRevenueUnavailableReason | null;
  };
  weightedMqlToSql: number | null;
  risks: {
    high: number;
    medium: number;
    total: number;
  };
  coverage: {
    products: number;
    published: number;
    revenueActual: TrendMetricCoverage;
    revenuePlan: TrendMetricCoverage;
    mqlToSql: TrendMetricCoverage;
    risks: TrendMetricCoverage;
  };
};

export type QoqUnavailableReason =
  | "NOT_ENOUGH_PERIODS"
  | "NO_COMPARABLE_PRODUCTS"
  | "MISSING_MONEY_UNIT"
  | "MONEY_MODE_MISMATCH"
  | "ZERO_PREVIOUS_ACTUAL";

export type RevenueQuarterOverQuarter = {
  fromPeriodId: string | null;
  toPeriodId: string | null;
  previousActual: number | null;
  currentActual: number | null;
  changeAmount: number | null;
  changePercent: number | null;
  comparedProducts: number;
  moneyMode: TrendMoneyMode | null;
  reason: QoqUnavailableReason | null;
};

export type QuarterlyTrends = {
  points: QuarterlyTrendPoint[];
  revenueQoq: RevenueQuarterOverQuarter;
};

type ResolvedQuarter = {
  input: PublishedQuarterTrendInput;
  productIds: string[];
  snapshots: PublishedReportTrendSnapshot[];
  snapshotsByProduct: Map<string, PublishedReportTrendSnapshot>;
};

function periodOrder(period: Pick<PublishedQuarterTrendInput, "year" | "quarter">) {
  return period.year * 4 + period.quarter;
}

function latestFourQuarters(inputs: readonly PublishedQuarterTrendInput[]) {
  const byPeriod = new Map<string, PublishedQuarterTrendInput>();

  for (const input of inputs) {
    const current = byPeriod.get(input.periodId);
    if (!current || periodOrder(input) >= periodOrder(current)) {
      byPeriod.set(input.periodId, input);
    }
  }

  return [...byPeriod.values()]
    .sort((left, right) => periodOrder(left) - periodOrder(right))
    .slice(-4);
}

function resolveQuarter(input: PublishedQuarterTrendInput): ResolvedQuarter {
  const declaredProductIds = [...new Set(input.productIds)];
  const productIds =
    declaredProductIds.length > 0
      ? declaredProductIds
      : [...new Set(input.snapshots.map((snapshot) => snapshot.productId))];
  const cohort = new Set(productIds);
  const snapshotsByProduct = new Map<
    string,
    PublishedReportTrendSnapshot
  >();

  for (const snapshot of input.snapshots) {
    if (!cohort.has(snapshot.productId)) continue;
    const current = snapshotsByProduct.get(snapshot.productId);
    if (!current || snapshot.versionNumber > current.versionNumber) {
      snapshotsByProduct.set(snapshot.productId, snapshot);
    }
  }

  return {
    input,
    productIds,
    snapshots: [...snapshotsByProduct.values()],
    snapshotsByProduct,
  };
}

function coverageFromStates(
  states: readonly DataState[],
  totalProducts: number,
): TrendMetricCoverage {
  const unpublished = Math.max(0, totalProducts - states.length);
  return {
    available: states.filter((state) => state === "VALUE").length,
    missing:
      unpublished + states.filter((state) => state === "MISSING").length,
    notApplicable: states.filter((state) => state === "NOT_APPLICABLE").length,
    total: totalProducts,
  };
}

function pairState(
  numerator: DataState,
  denominator: DataState,
): DataState {
  if (numerator === "MISSING" || denominator === "MISSING") return "MISSING";
  if (
    numerator === "NOT_APPLICABLE" ||
    denominator === "NOT_APPLICABLE"
  ) {
    return "NOT_APPLICABLE";
  }
  return "VALUE";
}

function riskState(content: FullReportContent): DataState {
  if (content.operations.risks.length > 0) return "VALUE";
  if (content.collectionStates.risks === "NOT_APPLICABLE") {
    return "NOT_APPLICABLE";
  }
  return content.collectionStates.risks === "ZERO" ? "VALUE" : "MISSING";
}

function moneyMode(content: FullReportContent): TrendMoneyMode | null {
  const unit = content.context.moneyUnit.trim();
  return unit
    ? {
        moneyUnit: unit,
        vatTreatment: content.context.vatTreatment,
      }
    : null;
}

function moneyModeKey(mode: TrendMoneyMode) {
  return `${mode.moneyUnit}\u0000${mode.vatTreatment}`;
}

function resolveQuarterMoneyMode(
  snapshots: readonly PublishedReportTrendSnapshot[],
): {
  moneyMode: TrendMoneyMode | null;
  reason: TrendRevenueUnavailableReason | null;
} {
  if (!snapshots.length) return { moneyMode: null, reason: null };
  const modes = snapshots.map((snapshot) => moneyMode(snapshot.content));
  if (modes.some((mode) => mode === null)) {
    return { moneyMode: null, reason: "MISSING_MONEY_UNIT" };
  }
  const presentModes = modes.filter(
    (mode): mode is TrendMoneyMode => mode !== null,
  );
  const uniqueModes = new Map(
    presentModes.map((mode) => [moneyModeKey(mode), mode]),
  );
  if (uniqueModes.size > 1) {
    return { moneyMode: null, reason: "MIXED_MONEY_MODE" };
  }
  return {
    moneyMode: presentModes[0] ?? null,
    reason: null,
  };
}

function sumValues(values: readonly (number | null)[]) {
  const present = values.filter((value): value is number => value !== null);
  return present.length
    ? present.reduce((total, value) => total + value, 0)
    : null;
}

function aggregateQuarter(quarter: ResolvedQuarter): QuarterlyTrendPoint {
  const { input, snapshots, productIds } = quarter;
  const revenueActualValues = snapshots.map((snapshot) =>
    measureNumber(snapshot.content.commercial.revenue.quarterActual),
  );
  const revenuePlanValues = snapshots.map((snapshot) =>
    measureNumber(snapshot.content.commercial.revenue.quarterPlan),
  );
  const mqlPairs = snapshots.map((snapshot) => ({
    mql: measureNumber(snapshot.content.marketing.mqlActual),
    sql: measureNumber(snapshot.content.marketing.sqlActual),
    state: pairState(
      snapshot.content.marketing.sqlActual.state,
      snapshot.content.marketing.mqlActual.state,
    ),
  }));
  const completeMqlPairs = mqlPairs.filter(
    (
      pair,
    ): pair is {
      mql: number;
      sql: number;
      state: "VALUE";
    } => pair.state === "VALUE" && pair.mql !== null && pair.sql !== null,
  );
  const totalMql = completeMqlPairs.reduce(
    (total, pair) => total + pair.mql,
    0,
  );
  const totalSql = completeMqlPairs.reduce(
    (total, pair) => total + pair.sql,
    0,
  );
  const risks = snapshots.flatMap((snapshot) =>
    snapshot.content.operations.risks.filter(
      (risk) =>
        risk.status !== "CLOSED" &&
        (risk.probability === "HIGH" || risk.probability === "MEDIUM"),
    ),
  );
  const resolvedMoneyMode = resolveQuarterMoneyMode(snapshots);

  return {
    periodId: input.periodId,
    periodLabel: input.periodLabel,
    year: input.year,
    quarter: input.quarter,
    revenue: {
      actual:
        resolvedMoneyMode.reason === null
          ? sumValues(revenueActualValues)
          : null,
      plan:
        resolvedMoneyMode.reason === null ? sumValues(revenuePlanValues) : null,
      moneyMode: resolvedMoneyMode.moneyMode,
      unavailableReason: resolvedMoneyMode.reason,
    },
    weightedMqlToSql:
      completeMqlPairs.length > 0 && totalMql > 0
        ? (totalSql / totalMql) * 100
        : null,
    risks: {
      high: risks.filter((risk) => risk.probability === "HIGH").length,
      medium: risks.filter((risk) => risk.probability === "MEDIUM").length,
      total: risks.length,
    },
    coverage: {
      products: productIds.length,
      published: snapshots.length,
      revenueActual: coverageFromStates(
        snapshots.map(
          (snapshot) =>
            snapshot.content.commercial.revenue.quarterActual.state,
        ),
        productIds.length,
      ),
      revenuePlan: coverageFromStates(
        snapshots.map(
          (snapshot) => snapshot.content.commercial.revenue.quarterPlan.state,
        ),
        productIds.length,
      ),
      mqlToSql: coverageFromStates(
        mqlPairs.map((pair) => pair.state),
        productIds.length,
      ),
      risks: coverageFromStates(
        snapshots.map((snapshot) => riskState(snapshot.content)),
        productIds.length,
      ),
    },
  };
}

function unavailableQoq(
  reason: QoqUnavailableReason,
  fromPeriodId: string | null,
  toPeriodId: string | null,
  comparedProducts = 0,
): RevenueQuarterOverQuarter {
  return {
    fromPeriodId,
    toPeriodId,
    previousActual: null,
    currentActual: null,
    changeAmount: null,
    changePercent: null,
    comparedProducts,
    moneyMode: null,
    reason,
  };
}

function calculateRevenueQoq(
  quarters: readonly ResolvedQuarter[],
): RevenueQuarterOverQuarter {
  if (quarters.length < 2) {
    return unavailableQoq(
      "NOT_ENOUGH_PERIODS",
      null,
      quarters.at(-1)?.input.periodId ?? null,
    );
  }

  const previous = quarters.at(-2)!;
  const current = quarters.at(-1)!;
  const paired = previous.productIds
    .filter((productId) => current.productIds.includes(productId))
    .map((productId) => ({
      previous: previous.snapshotsByProduct.get(productId),
      current: current.snapshotsByProduct.get(productId),
    }))
    .filter(
      (
        pair,
      ): pair is {
        previous: PublishedReportTrendSnapshot;
        current: PublishedReportTrendSnapshot;
      } => {
        if (!pair.previous || !pair.current) return false;
        return (
          measureNumber(
            pair.previous.content.commercial.revenue.quarterActual,
          ) !== null &&
          measureNumber(pair.current.content.commercial.revenue.quarterActual) !==
            null
        );
      },
    );

  if (!paired.length) {
    return unavailableQoq(
      "NO_COMPARABLE_PRODUCTS",
      previous.input.periodId,
      current.input.periodId,
    );
  }

  const modes = paired.flatMap((pair) => [
    moneyMode(pair.previous.content),
    moneyMode(pair.current.content),
  ]);
  if (modes.some((mode) => mode === null)) {
    return unavailableQoq(
      "MISSING_MONEY_UNIT",
      previous.input.periodId,
      current.input.periodId,
      paired.length,
    );
  }
  const presentModes = modes.filter(
    (mode): mode is TrendMoneyMode => mode !== null,
  );
  const uniqueModes = new Map(
    presentModes.map((mode) => [moneyModeKey(mode), mode]),
  );
  if (uniqueModes.size !== 1) {
    return unavailableQoq(
      "MONEY_MODE_MISMATCH",
      previous.input.periodId,
      current.input.periodId,
      paired.length,
    );
  }

  const previousActual = paired.reduce(
    (total, pair) =>
      total +
      measureNumber(pair.previous.content.commercial.revenue.quarterActual)!,
    0,
  );
  const currentActual = paired.reduce(
    (total, pair) =>
      total +
      measureNumber(pair.current.content.commercial.revenue.quarterActual)!,
    0,
  );
  const changeAmount = currentActual - previousActual;
  const shared = {
    fromPeriodId: previous.input.periodId,
    toPeriodId: current.input.periodId,
    previousActual,
    currentActual,
    changeAmount,
    comparedProducts: paired.length,
    moneyMode: [...uniqueModes.values()][0],
  };

  if (previousActual === 0) {
    return {
      ...shared,
      changePercent: null,
      reason: "ZERO_PREVIOUS_ACTUAL",
    };
  }

  return {
    ...shared,
    changePercent: (changeAmount / previousActual) * 100,
    reason: null,
  };
}

/**
 * Aggregates published report snapshots into at most four chronological
 * quarterly points. Mutable drafts should never be passed to this function.
 */
export function aggregateQuarterlyTrends(
  inputs: readonly PublishedQuarterTrendInput[],
): QuarterlyTrends {
  const quarters = latestFourQuarters(inputs).map(resolveQuarter);
  return {
    points: quarters.map(aggregateQuarter),
    revenueQoq: calculateRevenueQoq(quarters),
  };
}
