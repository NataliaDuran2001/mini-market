CREATE TABLE "categories" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "categories_name_not_blank" CHECK (length(btrim("categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"is_fixed" boolean DEFAULT false NOT NULL,
	CONSTRAINT "expense_categories_name_not_blank" CHECK (length(btrim("expense_categories"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_methods" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "payment_methods_name_not_blank" CHECK (length(btrim("payment_methods"."name")) > 0),
	CONSTRAINT "payment_methods_kind_check" CHECK ("payment_methods"."kind" in ('cash', 'transfer', 'qr', 'card', 'credit'))
);
--> statement-breakpoint
CREATE TABLE "units" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"allows_decimals" boolean DEFAULT false NOT NULL,
	CONSTRAINT "units_name_not_blank" CHECK (length(btrim("units"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_methods" ADD CONSTRAINT "payment_methods_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "units" ADD CONSTRAINT "units_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_tenant_id_idx" ON "categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_name_idx" ON "categories" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "expense_categories_tenant_id_idx" ON "expense_categories" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_tenant_name_idx" ON "expense_categories" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "payment_methods_tenant_id_idx" ON "payment_methods" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_tenant_code_idx" ON "payment_methods" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_methods_tenant_name_idx" ON "payment_methods" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE INDEX "units_tenant_id_idx" ON "units" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_tenant_code_idx" ON "units" USING btree ("tenant_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "units_tenant_name_idx" ON "units" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
-- Row level security and grants (docs/04-coding-standards.md section 8). Catalog rows are retired
-- with is_active, never deleted: no DELETE or TRUNCATE for app_user.
SELECT "app"."enable_tenant_rls"('public.categories');--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.units');--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.payment_methods');--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.expense_categories');--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "categories", "units", "payment_methods", "expense_categories" TO "app_user";