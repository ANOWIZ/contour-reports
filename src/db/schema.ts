import {
  boolean,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const newId = () => crypto.randomUUID();

export const userRole = pgEnum("user_role", ["MANAGEMENT", "PRODUCT_LEAD"]);
export const reportStatus = pgEnum("report_status", [
  "DRAFT",
  "SUBMITTED",
  "RETURNED",
  "PUBLISHED",
]);
export const riskStatus = pgEnum("risk_status", ["OPEN", "WATCH", "CLOSED"]);
export const trend = pgEnum("trend", ["UP", "FLAT", "DOWN"]);

export const products = pgTable("products", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  description: text("description"),
  accent: text("accent").notNull().default("#ea5b24"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const user = pgTable("user", {
  id: text("id").primaryKey().$defaultFn(newId),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  role: userRole("role").notNull().default("PRODUCT_LEAD"),
  productId: text("product_id").references(() => products.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("session_token_unique").on(table.token)],
);

export const account = pgTable("account", {
  id: text("id").primaryKey().$defaultFn(newId),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", {
    withTimezone: true,
  }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
    withTimezone: true,
  }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey().$defaultFn(newId),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportingPeriods = pgTable(
  "reporting_periods",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    year: integer("year").notNull(),
    quarter: integer("quarter").notNull(),
    label: text("label").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    isActive: boolean("is_active").notNull().default(false),
  },
  (table) => [
    uniqueIndex("reporting_period_year_quarter_unique").on(
      table.year,
      table.quarter,
    ),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    productId: text("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    periodId: text("period_id")
      .notNull()
      .references(() => reportingPeriods.id, { onDelete: "restrict" }),
    status: reportStatus("status").notNull().default("DRAFT"),
    revision: integer("revision").notNull().default(0),
    version: integer("version").notNull().default(0),
    copiedFromReportId: text("copied_from_report_id"),
    executiveSummary: text("executive_summary").notNull().default(""),
    achievements: text("achievements").notNull().default(""),
    nextSteps: text("next_steps").notNull().default(""),
    managementDecision: text("management_decision").notNull().default(""),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("report_product_period_unique").on(
      table.productId,
      table.periodId,
    ),
  ],
);

export const reportVersions = pgTable(
  "report_versions",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    reportRevision: integer("report_revision").notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    content: jsonb("content")
      .$type<Record<string, unknown>>()
      .notNull(),
    contentHash: text("content_hash"),
    completeness: integer("completeness"),
    productName: text("product_name").notNull(),
    productCode: text("product_code").notNull(),
    periodLabel: text("period_label").notNull(),
    submittedById: text("submitted_by_id").references(() => user.id, {
      onDelete: "set null",
    }),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("report_version_number_unique").on(
      table.reportId,
      table.versionNumber,
    ),
    index("report_versions_report_submitted_idx").on(
      table.reportId,
      table.submittedAt,
    ),
  ],
);

export const reportReviews = pgTable(
  "report_reviews",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    fromStatus: reportStatus("from_status").notNull(),
    toStatus: reportStatus("to_status").notNull(),
    comment: text("comment").notNull(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("report_reviews_report_created_idx").on(
      table.reportId,
      table.createdAt,
    ),
  ],
);

export const metricSnapshots = pgTable(
  "metric_snapshots",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    group: text("group").notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    unit: text("unit").notNull(),
    plan: real("plan").notNull().default(0),
    actual: real("actual").notNull().default(0),
    previous: real("previous").notNull().default(0),
    trend: trend("trend").notNull().default("FLAT"),
    monthly: jsonb("monthly")
      .$type<Array<{ month: string; plan: number; actual: number }>>()
      .notNull()
      .default([]),
    sortOrder: integer("sort_order").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("metric_report_key_unique").on(table.reportId, table.key),
  ],
);

export const funnelStages = pgTable(
  "funnel_stages",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    reportId: text("report_id")
      .notNull()
      .references(() => reports.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    label: text("label").notNull(),
    value: integer("value").notNull().default(0),
    conversion: real("conversion").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("funnel_report_key_unique").on(table.reportId, table.key),
  ],
);

export const risks = pgTable("risks", {
  id: text("id").primaryKey().$defaultFn(newId),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  impact: text("impact").notNull(),
  mitigation: text("mitigation").notNull().default(""),
  owner: text("owner").notNull().default(""),
  status: riskStatus("status").notNull().default("OPEN"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const initiatives = pgTable("initiatives", {
  id: text("id").primaryKey().$defaultFn(newId),
  reportId: text("report_id")
    .notNull()
    .references(() => reports.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  outcome: text("outcome").notNull().default(""),
  progress: integer("progress").notNull().default(0),
  targetDate: timestamp("target_date", { withTimezone: true }),
  sortOrder: integer("sort_order").notNull().default(0),
});
