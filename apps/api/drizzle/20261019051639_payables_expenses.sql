CREATE TABLE "expense_payments" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_id" uuid NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"paid_at" date NOT NULL,
	"payment_method_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_payments_amount_check" CHECK ("expense_payments"."amount_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "expenses" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_category_id" uuid NOT NULL,
	"recurring_expense_id" uuid,
	"name" text NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"period_year" integer NOT NULL,
	"period_month" integer NOT NULL,
	"due_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"paid_centavos" bigint DEFAULT 0 NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expenses_name_check" CHECK (length(btrim("expenses"."name")) > 0),
	CONSTRAINT "expenses_amount_check" CHECK ("expenses"."amount_centavos" > 0),
	CONSTRAINT "expenses_month_check" CHECK ("expenses"."period_month" between 1 and 12),
	CONSTRAINT "expenses_paid_check" CHECK ("expenses"."paid_centavos" >= 0 and "expenses"."paid_centavos" <= "expenses"."amount_centavos"),
	CONSTRAINT "expenses_status_check" CHECK (("expenses"."status" = 'pending' and "expenses"."paid_centavos" = 0)
        or ("expenses"."status" = 'partial' and "expenses"."paid_centavos" > 0 and "expenses"."paid_centavos" < "expenses"."amount_centavos")
        or ("expenses"."status" = 'paid' and "expenses"."paid_centavos" = "expenses"."amount_centavos"))
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"expense_category_id" uuid NOT NULL,
	"name" text NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"day_of_month_due" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"starts_period" text NOT NULL,
	"ends_period" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recurring_expenses_name_check" CHECK (length(btrim("recurring_expenses"."name")) > 0),
	CONSTRAINT "recurring_expenses_amount_check" CHECK ("recurring_expenses"."amount_centavos" > 0),
	CONSTRAINT "recurring_expenses_day_check" CHECK ("recurring_expenses"."day_of_month_due" between 1 and 31),
	CONSTRAINT "recurring_expenses_period_check" CHECK ("recurring_expenses"."starts_period" ~ '^\d{4}-(0[1-9]|1[0-2])$' and ("recurring_expenses"."ends_period" is null or ("recurring_expenses"."ends_period" ~ '^\d{4}-(0[1-9]|1[0-2])$' and "recurring_expenses"."ends_period" >= "recurring_expenses"."starts_period")))
);
--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_payment_method_id_payment_methods_id_fk" FOREIGN KEY ("payment_method_id") REFERENCES "public"."payment_methods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expense_category_id_expense_categories_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurring_expense_id_recurring_expenses_id_fk" FOREIGN KEY ("recurring_expense_id") REFERENCES "public"."recurring_expenses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_expense_category_id_expense_categories_id_fk" FOREIGN KEY ("expense_category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expense_payments_tenant_id_idx" ON "expense_payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "expense_payments_expense_idx" ON "expense_payments" USING btree ("tenant_id","expense_id");--> statement-breakpoint
CREATE INDEX "expenses_tenant_id_idx" ON "expenses" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "expenses_tenant_period_idx" ON "expenses" USING btree ("tenant_id","period_year","period_month");--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_recurring_period_idx" ON "expenses" USING btree ("tenant_id","recurring_expense_id","period_year","period_month") WHERE "expenses"."recurring_expense_id" is not null;--> statement-breakpoint
CREATE INDEX "recurring_expenses_tenant_id_idx" ON "recurring_expenses" USING btree ("tenant_id");
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.recurring_expenses');
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.expenses');
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.expense_payments');
--> statement-breakpoint
-- Nothing is deleted: a template is switched off with `active`. Payments are append-only for app_user.
GRANT SELECT, INSERT, UPDATE ON "recurring_expenses" TO "app_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "expenses" TO "app_user";
--> statement-breakpoint
GRANT SELECT, INSERT ON "expense_payments" TO "app_user";
