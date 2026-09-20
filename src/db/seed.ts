import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import {
  account,
  funnelStages,
  initiatives,
  metricSnapshots,
  products,
  reportingPeriods,
  reports,
  reportVersions,
  risks,
  session,
  user,
  verification,
} from "./schema";
import {
  defaultFullReportContent,
  notApplicableMeasure,
  reportCompleteness,
  valueMeasure,
  type FullReportContent,
} from "../modules/reports/content";
import { reportContentHash } from "../modules/reports/integrity";

const connectionString =
  process.env.DATABASE_URL ??
  "postgresql://reporting:reporting_dev@localhost:5433/product_reporting";
const sql = postgres(connectionString, { max: 1, prepare: false });
const db = drizzle(sql);

const seedAuth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  secret:
    process.env.BETTER_AUTH_SECRET ??
    "local-development-secret-change-before-production-2026",
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "PRODUCT_LEAD",
        input: false,
      },
      productId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
});

const productData = [
  {
    code: "PAY",
    name: "Платежи",
    description: "Платежные сценарии для корпоративных клиентов",
    accent: "#e95b26",
    status: "DRAFT" as const,
    revenue: { plan: 32, actual: 29.8, previous: 24.1 },
    clients: { plan: 240, actual: 226, previous: 198 },
  },
  {
    code: "CAB",
    name: "Личный кабинет",
    description: "Самообслуживание и цифровые операции",
    accent: "#4b70c1",
    status: "SUBMITTED" as const,
    revenue: { plan: 18, actual: 19.2, previous: 15.6 },
    clients: { plan: 1250, actual: 1328, previous: 1090 },
  },
  {
    code: "DATA",
    name: "Аналитика",
    description: "Отчетность и аналитические сервисы",
    accent: "#3a8e72",
    status: "PUBLISHED" as const,
    revenue: { plan: 24, actual: 25.7, previous: 20.4 },
    clients: { plan: 410, actual: 438, previous: 355 },
  },
  {
    code: "API",
    name: "API-платформа",
    description: "Интеграционный слой продуктовой экосистемы",
    accent: "#9a62a8",
    status: "RETURNED" as const,
    revenue: { plan: 16, actual: 13.4, previous: 12.9 },
    clients: { plan: 82, actual: 69, previous: 61 },
  },
];

function buildContent(
  product: (typeof productData)[number],
  index: number,
): FullReportContent {
  const content = structuredClone(defaultFullReportContent);
  const ownerNames = [
    "Анна Власова",
    "Михаил Серов",
    "Ольга Белова",
    "Илья Громов",
  ];

  content.context = {
    productOwner: ownerNames[index],
    productMarketer: "Мария Крылова",
    contactEmail:
      index === 0 ? "lead@contour.local" : `${product.code.toLowerCase()}@contour.local`,
    contactPhone: "+7 900 000-00-00",
    reportScope: `Коммерческие, маркетинговые и продуктовые результаты направления «${product.name}» за 2 квартал 2026 года.`,
    moneyUnit: "млн ₽",
    vatTreatment: "INCLUDED",
  };
  content.summary = {
    quarterResult:
      index === 0
        ? "Выручка выросла год к году, но квартальный план не выполнен из-за длинного цикла согласования крупных сделок."
        : `Направление «${product.name}» продолжило рост ключевых показателей и выполнило основные инициативы квартала.`,
    mainProblems:
      index === 0
        ? "Низкая конверсия предложений в сделки и задержки юридического согласования."
        : "Ограниченная пропускная способность команды и неоднородное качество входящего потока.",
    mainRisk:
      index === 3
        ? "Риск недовыполнения годового плана выручки."
        : "Сроки подключения крупных клиентов могут сдвинуться.",
    requestedAttention:
      index === 0
        ? "Требуется решение по выделению аналитика и приоритету интеграции с CRM."
        : "Подтвердить приоритеты следующего квартала.",
  };
  content.commercial.revenue = {
    annualPlan: valueMeasure(product.revenue.plan * 4, "Финансовый план 2026"),
    quarterPlan: valueMeasure(product.revenue.plan, "Финансовый план 2026"),
    quarterActual: valueMeasure(product.revenue.actual, "ERP, закрытие июня"),
    priorYearQuarterActual: valueMeasure(product.revenue.previous, "ERP, 2 квартал 2025"),
    yearForecast: valueMeasure(
      product.revenue.actual * 3.7,
      "Прогноз продуктового лида",
    ),
    varianceReason:
      product.revenue.actual < product.revenue.plan
        ? "Две крупные сделки перенесены на следующий квартал."
        : "Ускорение подключений и рост среднего чека.",
    correctiveAction:
      product.revenue.actual < product.revenue.plan
        ? "Еженедельный контроль сделок и раннее подключение юридической службы."
        : "Закрепить успешный сценарий онбординга и масштабировать на сегмент.",
    actionOwner: ownerNames[index],
    actionDueDate: "15.08.2026",
    actionStatus:
      product.revenue.actual < product.revenue.plan ? "IN_PROGRESS" : "DONE",
    forecastFactor: "Сроки подписания трех крупнейших контрактов.",
  };
  content.commercial.presales = {
    plan: valueMeasure(36 + index * 4, "CRM"),
    actual: valueMeasure(32 + index * 5, "CRM"),
    comment: "Учитываются квалифицированные пресейлы с назначенным владельцем.",
    series: [
      {
        quarter: "Q1 2026",
        value: valueMeasure(25 + index * 3, "CRM"),
      },
      {
        quarter: "Q2 2026",
        value: valueMeasure(32 + index * 5, "CRM"),
      },
    ],
  };
  content.commercial.forecastSeries = [
    {
      quarter: "1 квартал 2026",
      forecast: valueMeasure(product.revenue.previous * 0.96, "Прогноз Q1"),
      actual: valueMeasure(product.revenue.previous, "ERP"),
      factor: "Фактическое закрытие квартала.",
    },
    {
      quarter: "2 квартал 2026",
      forecast: valueMeasure(product.revenue.plan, "Прогноз Q2"),
      actual: valueMeasure(product.revenue.actual, "ERP"),
      factor: "Перенос двух сделок повлиял на факт.",
    },
    {
      quarter: "3 квартал 2026",
      forecast: valueMeasure(product.revenue.plan * 1.12, "Прогноз лида"),
      actual: {
        state: "MISSING",
        value: null,
        source: "Квартал не закрыт",
      },
      factor: "Закрытие трех якорных контрактов.",
    },
    {
      quarter: "4 квартал 2026",
      forecast: valueMeasure(product.revenue.plan * 1.2, "Прогноз лида"),
      actual: {
        state: "MISSING",
        value: null,
        source: "Квартал не начат",
      },
      factor: "Сезонность и расширение действующей базы.",
    },
  ];
  content.commercial.deals = [
    {
      customer: "АО Север",
      subject: "Корпоративное подключение и интеграция",
      status: "Согласование договора",
      amountVat: valueMeasure(7.8 + index, "CRM"),
    },
    {
      customer: "Группа Альфа",
      subject: "Расширение действующего контракта",
      status: "Коммерческое предложение",
      amountVat: valueMeasure(4.2 + index * 0.4, "CRM"),
    },
  ];
  content.commercial.funnel = {
    leads: valueMeasure(420 + index * 50, "CRM"),
    qualified: valueMeasure(168 + index * 18, "CRM"),
    proposals: valueMeasure(71 + index * 8, "CRM"),
    won: valueMeasure(29 + index * 3, "CRM"),
    cancelled: valueMeasure(18 + index, "CRM"),
  };
  const leadTotal = 420 + index * 50;
  const sqlTotal = 168 + index * 18;
  const taskedTotal = 71 + index * 8;
  const wonTotal = 29 + index * 3;
  content.commercial.funnelStages = [
    {
      key: "LEADS",
      label: "LEADS",
      active: valueMeasure(leadTotal - sqlTotal - (52 + index * 4), "CRM"),
      nextStage: valueMeasure(sqlTotal, "CRM"),
      cancelled: valueMeasure(52 + index * 4, "CRM"),
    },
    {
      key: "SQL",
      label: "SQL",
      active: valueMeasure(sqlTotal - taskedTotal - (37 + index * 2), "CRM"),
      nextStage: valueMeasure(taskedTotal, "CRM"),
      cancelled: valueMeasure(37 + index * 2, "CRM"),
    },
    {
      key: "SQL_WITH_TASKS",
      label: "SQL с задачами",
      active: valueMeasure(taskedTotal - wonTotal - (18 + index), "CRM"),
      nextStage: valueMeasure(wonTotal, "CRM"),
      cancelled: valueMeasure(18 + index, "CRM"),
    },
    {
      key: "WON",
      label: "Успешная сделка",
      active: valueMeasure(wonTotal, "CRM"),
      nextStage: notApplicableMeasure("Финальный этап"),
      cancelled: notApplicableMeasure("Финальный этап"),
    },
  ];
  content.commercial.funnelObservations = {
    leadToSql: "Конверсия соответствует целевому диапазону сегмента.",
    sqlToTasked: "Требуется улучшить квалификацию и назначение следующих действий.",
    taskedToWon: "Узкое место — согласование коммерческих условий.",
    leadToWon: "Итоговая конверсия ниже цели из-за длинного цикла сделки.",
    sqlToWon: "Еженедельный контроль задач должен сократить потери.",
  };
  content.commercial.lostDeals = [
    {
      customer: "ООО Горизонт",
      amount: valueMeasure(3.2 + index * 0.2, "CRM"),
      reason: "Не согласован бюджет",
      systemicProblem: "Поздняя квалификация финансового владельца сделки.",
    },
  ];
  content.marketing = {
    mqlPlan: valueMeasure(180 + index * 20, "Маркетинговый план"),
    mqlActual: valueMeasure(172 + index * 18, "CRM"),
    sqlActual: valueMeasure(86 + index * 9, "CRM"),
    sqlWithTasksActual: valueMeasure(52 + index * 6, "CRM"),
    dealsActual: valueMeasure(29 + index * 3, "CRM"),
    mqlToSqlWithTasksPlan: valueMeasure(40, "Маркетинговый план"),
    conversionActions:
      "Пересобрать сегментацию кампаний и добавить отраслевой прогрев для крупных клиентов.",
    goals: [
      {
        title: "Рост квалифицированного спроса",
        target: "+20% MQL год к году",
        result: "+16% MQL год к году",
        progress: 80,
        status: "В работе",
      },
    ],
    activities: [
      {
        title: "Отраслевой вебинар",
        status: "Завершено",
        result: "64 участника, 18 MQL",
        owner: "Продуктовый маркетолог",
      },
      {
        title: "Кампания по действующей базе",
        status: "В работе",
        result: "Промежуточно 11 SQL",
        owner: "CRM-маркетинг",
      },
    ],
  };
  content.product = {
    launches: [
      {
        title: "Ускоренный онбординг",
        status: "Запущено",
        plannedDate: "30.06.2026",
        actualDate: "24.06.2026",
        result: "Средний срок подключения сокращен с 12 до 8 дней.",
      },
    ],
    hypotheses: [
      {
        hypothesis:
          "Отраслевой onboarding увеличит активацию крупных клиентов.",
        method: "A/B-пилот на двух отраслевых сегментах",
        status: "Подтверждена",
        result: "Активация выросла на 9 п.п.",
      },
    ],
    annualGoals: [
      {
        title: "Рост активной клиентской базы",
        target: `${product.clients.plan} активных клиентов`,
        result: `${product.clients.actual} активных клиентов`,
        progress: Math.min(
          100,
          Math.round((product.clients.actual / product.clients.plan) * 100),
        ),
        status: product.clients.actual >= product.clients.plan ? "Выполнено" : "В работе",
      },
    ],
  };
  content.operations = {
    resources: [
      {
        role: "Продуктовая разработка",
        capacity: valueMeasure(8, "Ресурсный план"),
        load: valueMeasure(92, "Планирование команды"),
        issue: "Дефицит аналитической экспертизы на интеграционных задачах.",
      },
      {
        role: "Маркетинг",
        capacity: valueMeasure(2, "Ресурсный план"),
        load: valueMeasure(80, "Планирование команды"),
        issue: "",
      },
    ],
    expenses: [
      {
        category: "ФОТ",
        plan: valueMeasure(12.4 + index, "Финансовый план"),
        actual: valueMeasure(12.1 + index, "ERP"),
        comment: "В пределах квартального бюджета.",
      },
      {
        category: "Маркетинг",
        plan: valueMeasure(3.2, "Маркетинговый план"),
        actual: valueMeasure(2.9, "ERP"),
        comment: "Часть кампании перенесена на следующий квартал.",
      },
      {
        category: "Прямые расходы",
        plan: valueMeasure(1.8, "Финансовый план"),
        actual: valueMeasure(2.1, "ERP"),
        comment: "Рост расходов на интеграционные работы.",
      },
    ],
    risks: [
      {
        title:
          index === 0
            ? "Длинный цикл согласования"
            : "Сдвиг сроков ключевой инициативы",
        probability: index === 3 ? "HIGH" : "MEDIUM",
        impact:
          index === 0
            ? "До −3,2 млн ₽ к плану следующего квартала"
            : "Возможное отклонение годовой цели",
        mitigation: "Еженедельный контроль и работа с владельцами блокеров.",
        owner: ownerNames[index],
        status: "OPEN",
      },
    ],
  };
  content.decisions = [
    {
      category: "RESOURCES",
      subject: "Выделение аналитика",
      currentState:
        "Интеграционные задачи конкурируют за одного аналитика с двумя направлениями.",
      requestedDecision: "Выделить 1 FTE аналитика на 3 квартал.",
      expectedImpact: "Сокращение срока запуска интеграций на 3 недели.",
    },
  ];
  content.nextQuarter = [
    {
      goal: "Выполнить квартальный план выручки",
      actions:
        "Закрыть три якорные сделки и сократить срок юридического согласования.",
      expectedResult: `${Math.round(product.revenue.plan * 1.12)} млн ₽ выручки`,
      owner: ownerNames[index],
      dueDate: "30.09.2026",
    },
    {
      goal: "Ускорить активацию клиентов",
      actions: "Масштабировать новый onboarding на все сегменты.",
      expectedResult: "+8 п.п. к активации",
      owner: "Руководитель продукта",
      dueDate: "15.09.2026",
    },
  ];

  return content;
}

async function ensureUser(
  email: string,
  name: string,
  role: "MANAGEMENT" | "PRODUCT_LEAD",
  productId: string | null,
) {
  let [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);

  if (!existing) {
    await seedAuth.api.signUpEmail({
      body: { email, name, password: "demo-report" },
    });
    [existing] = await db.select().from(user).where(eq(user.email, email)).limit(1);
  }

  if (!existing) throw new Error(`Не удалось создать пользователя ${email}`);

  await db
    .update(user)
    .set({ role, productId, emailVerified: true, updatedAt: new Date() })
    .where(eq(user.id, existing.id));
}

async function main() {
  const now = new Date();
  const [period] = await db
    .insert(reportingPeriods)
    .values({
      year: 2026,
      quarter: 2,
      label: "2 квартал 2026",
      startsAt: new Date("2026-04-01T00:00:00+05:00"),
      endsAt: new Date("2026-06-30T23:59:59+05:00"),
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [reportingPeriods.year, reportingPeriods.quarter],
      set: { label: "2 квартал 2026", isActive: true },
    })
    .returning();

  const createdProducts = [];
  for (const item of productData) {
    const [product] = await db
      .insert(products)
      .values({
        code: item.code,
        name: item.name,
        description: item.description,
        accent: item.accent,
      })
      .onConflictDoUpdate({
        target: products.code,
        set: {
          name: item.name,
          description: item.description,
          accent: item.accent,
          updatedAt: now,
        },
      })
      .returning();
    createdProducts.push({ ...item, id: product.id });
  }

  await ensureUser("management@contour.local", "Елена Морозова", "MANAGEMENT", null);
  await ensureUser(
    "lead@contour.local",
    "Анна Власова",
    "PRODUCT_LEAD",
    createdProducts[0].id,
  );

  for (const [index, product] of createdProducts.entries()) {
    const fullContent = buildContent(product, index);
    const [report] = await db
      .insert(reports)
      .values({
        productId: product.id,
        periodId: period.id,
        status: product.status,
        version: product.status === "DRAFT" ? 0 : 1,
        executiveSummary:
          index === 0
            ? "Рост выручки сохраняется, но конверсия из квалифицированной возможности в сделку ниже плана. Фокус — ускорение согласований у крупных клиентов."
            : `Основные показатели направления «${product.name}» обновлены за квартал.`,
        achievements:
          index === 0
            ? "Запустили повторные платежи и сократили время подключения клиента с 12 до 8 дней."
            : "Выполнены ключевые инициативы квартального плана.",
        nextSteps:
          index === 0
            ? "Автоматизировать онбординг, запустить пилот с тремя якорными клиентами."
            : "Сфокусироваться на росте ключевой метрики и качестве сервиса.",
        managementDecision:
          product.status === "RETURNED"
            ? "Уточните причины отклонения выручки и добавьте план восстановления."
            : "",
        content: fullContent,
        submittedAt:
          product.status === "DRAFT" ? null : new Date("2026-07-18T10:00:00+05:00"),
        publishedAt:
          product.status === "PUBLISHED"
            ? new Date("2026-07-20T12:00:00+05:00")
            : null,
      })
      .onConflictDoUpdate({
        target: [reports.productId, reports.periodId],
        set: {
          status: product.status,
          version: product.status === "DRAFT" ? 0 : 1,
          content: fullContent,
          executiveSummary: fullContent.summary.quarterResult,
          achievements: fullContent.product.annualGoals
            .map((goal) => `${goal.title}: ${goal.result}`)
            .join("\n"),
          nextSteps: fullContent.nextQuarter
            .map((item) => `${item.goal}: ${item.expectedResult}`)
            .join("\n"),
          updatedAt: now,
        },
      })
      .returning();

    if (product.status !== "DRAFT") {
      const submittedAt = new Date("2026-07-18T10:00:00+05:00");
      await db
        .insert(reportVersions)
        .values({
          id: `${report.id}-seed-v1`,
          reportId: report.id,
          versionNumber: 1,
          reportRevision: report.revision,
          content: fullContent,
          contentHash: reportContentHash(fullContent),
          completeness: reportCompleteness(fullContent).percent,
          productName: product.name,
          productCode: product.code,
          periodLabel: period.label,
          submittedAt,
        })
        .onConflictDoUpdate({
          target: [reportVersions.reportId, reportVersions.versionNumber],
          set: {
            reportRevision: report.revision,
            content: fullContent,
            contentHash: reportContentHash(fullContent),
            completeness: reportCompleteness(fullContent).percent,
            productName: product.name,
            productCode: product.code,
            periodLabel: period.label,
            submittedAt,
          },
        });
    }

    const metricValues = [
      {
        reportId: report.id,
        group: "finance",
        key: "revenue",
        label: "Выручка",
        unit: "млн ₽",
        ...product.revenue,
        trend: product.revenue.actual >= product.revenue.previous ? ("UP" as const) : ("DOWN" as const),
        monthly: [
          { month: "Апр", plan: product.revenue.plan * 0.29, actual: product.revenue.actual * 0.27 },
          { month: "Май", plan: product.revenue.plan * 0.62, actual: product.revenue.actual * 0.6 },
          { month: "Июн", plan: product.revenue.plan, actual: product.revenue.actual },
        ],
        sortOrder: 1,
      },
      {
        reportId: report.id,
        group: "sales",
        key: "presales",
        label: "Пресейлы",
        unit: "шт.",
        plan: fullContent.commercial.presales.plan.value ?? 0,
        actual: fullContent.commercial.presales.actual.value ?? 0,
        previous: 0,
        trend: "UP" as const,
        monthly: [],
        sortOrder: 2,
      },
      {
        reportId: report.id,
        group: "marketing",
        key: "mql",
        label: "MQL",
        unit: "шт.",
        plan: fullContent.marketing.mqlPlan.value ?? 0,
        actual: fullContent.marketing.mqlActual.value ?? 0,
        previous: 0,
        trend: "UP" as const,
        monthly: [],
        sortOrder: 3,
      },
    ];

    for (const metric of metricValues) {
      await db
        .insert(metricSnapshots)
        .values(metric)
        .onConflictDoUpdate({
          target: [metricSnapshots.reportId, metricSnapshots.key],
          set: {
            plan: metric.plan,
            actual: metric.actual,
            previous: metric.previous,
            trend: metric.trend,
            monthly: metric.monthly,
            updatedAt: now,
          },
        });
    }

    const hasFunnel = await db
      .select({ id: funnelStages.id })
      .from(funnelStages)
      .where(eq(funnelStages.reportId, report.id))
      .limit(1);
    if (!hasFunnel.length) {
      await db.insert(funnelStages).values([
        { reportId: report.id, key: "leads", label: "Лиды", value: 420, conversion: 100, sortOrder: 1 },
        { reportId: report.id, key: "qualified", label: "Квалиф.", value: 168, conversion: 40, sortOrder: 2 },
        { reportId: report.id, key: "proposal", label: "Предлож.", value: 71, conversion: 42.3, sortOrder: 3 },
        { reportId: report.id, key: "won", label: "Сделки", value: 29, conversion: 40.8, sortOrder: 4 },
      ]);
    }

    const hasRisk = await db
      .select({ id: risks.id })
      .from(risks)
      .where(eq(risks.reportId, report.id))
      .limit(1);
    if (!hasRisk.length && index !== 2) {
      await db.insert(risks).values({
        reportId: report.id,
        title: index === 0 ? "Длинный цикл согласования" : "Риск квартального плана",
        impact: index === 0 ? "До −3,2 млн ₽ к плану следующего квартала" : "Возможное отклонение ключевой метрики",
        mitigation: "Еженедельный контроль и работа с владельцами блокеров",
        owner: "Лид продукта",
        status: "OPEN",
      });
    }

    const hasInitiative = await db
      .select({ id: initiatives.id })
      .from(initiatives)
      .where(eq(initiatives.reportId, report.id))
      .limit(1);
    if (!hasInitiative.length) {
      await db.insert(initiatives).values([
        {
          reportId: report.id,
          title: "Ускорение онбординга",
          outcome: "−30% к сроку",
          progress: 72,
          targetDate: new Date("2026-08-30T00:00:00+05:00"),
          sortOrder: 1,
        },
        {
          reportId: report.id,
          title: "Рост активации",
          outcome: "+8 п.п.",
          progress: 46,
          targetDate: new Date("2026-09-30T00:00:00+05:00"),
          sortOrder: 2,
        },
      ]);
    }
  }

  console.log("Демо-данные готовы.");
  console.log("Лид: lead@contour.local / demo-report");
  console.log("Руководство: management@contour.local / demo-report");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
