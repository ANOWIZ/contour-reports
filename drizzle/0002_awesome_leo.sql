CREATE TABLE "report_reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"from_status" "report_status" NOT NULL,
	"to_status" "report_status" NOT NULL,
	"comment" text NOT NULL,
	"actor_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"version_number" integer NOT NULL,
	"report_revision" integer NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" text,
	"completeness" integer,
	"product_name" text NOT NULL,
	"product_code" text NOT NULL,
	"period_label" text NOT NULL,
	"submitted_by_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "copied_from_report_id" text;--> statement-breakpoint
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_versions" ADD CONSTRAINT "report_versions_submitted_by_id_user_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "report_reviews_report_created_idx" ON "report_reviews" USING btree ("report_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "report_version_number_unique" ON "report_versions" USING btree ("report_id","version_number");--> statement-breakpoint
CREATE INDEX "report_versions_report_submitted_idx" ON "report_versions" USING btree ("report_id","submitted_at");--> statement-breakpoint
UPDATE "reports"
SET "version" = 1
WHERE "status" IN ('SUBMITTED', 'PUBLISHED');--> statement-breakpoint
INSERT INTO "report_versions" (
	"id",
	"report_id",
	"version_number",
	"report_revision",
	"schema_version",
	"content",
	"content_hash",
	"completeness",
	"product_name",
	"product_code",
	"period_label",
	"submitted_by_id",
	"submitted_at"
)
SELECT
	"reports"."id" || '-legacy-v1',
	"reports"."id",
	1,
	"reports"."revision",
	1,
	"reports"."content",
	NULL,
	NULL,
	"products"."name",
	"products"."code",
	"reporting_periods"."label",
	NULL,
	COALESCE(
		"reports"."submitted_at",
		"reports"."published_at",
		"reports"."updated_at"
	)
FROM "reports"
INNER JOIN "products" ON "products"."id" = "reports"."product_id"
INNER JOIN "reporting_periods" ON "reporting_periods"."id" = "reports"."period_id"
WHERE "reports"."status" IN ('SUBMITTED', 'PUBLISHED');
