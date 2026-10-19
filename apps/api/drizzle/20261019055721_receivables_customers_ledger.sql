CREATE TABLE "credit_ledger" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seq" bigint GENERATED ALWAYS AS IDENTITY (sequence name "credit_ledger_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"payment_method" text,
	"occurred_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_kind_check" CHECK ("credit_ledger"."kind" in ('charge', 'payment', 'reversal')),
	CONSTRAINT "credit_ledger_amount_check" CHECK (("credit_ledger"."kind" = 'charge' and "credit_ledger"."amount_centavos" > 0) or ("credit_ledger"."kind" <> 'charge' and "credit_ledger"."amount_centavos" < 0)),
	CONSTRAINT "credit_ledger_reference_check" CHECK (("credit_ledger"."reference_type" is null) = ("credit_ledger"."reference_id" is null)),
	CONSTRAINT "credit_ledger_payment_method_check" CHECK (("credit_ledger"."kind" = 'payment' and "credit_ledger"."payment_method" is not null and "credit_ledger"."payment_method" in ('cash', 'transfer', 'qr', 'card')) or ("credit_ledger"."kind" <> 'payment' and "credit_ledger"."payment_method" is null)),
	CONSTRAINT "credit_ledger_reference_kind_check" CHECK (("credit_ledger"."kind" = 'payment' and "credit_ledger"."reference_id" is null) or ("credit_ledger"."kind" <> 'payment' and "credit_ledger"."reference_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"document_id" text,
	"credit_limit_centavos" bigint,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_tenant_id_id_key" UNIQUE("tenant_id","id"),
	CONSTRAINT "customers_credit_limit_check" CHECK ("customers"."credit_limit_centavos" >= 0)
);
--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_customer_fk" FOREIGN KEY ("tenant_id","customer_id") REFERENCES "public"."customers"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customers" ADD CONSTRAINT "customers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "credit_ledger_tenant_id_idx" ON "credit_ledger" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_tenant_customer_idx" ON "credit_ledger" USING btree ("tenant_id","customer_id","occurred_at","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_charge_reference_idx" ON "credit_ledger" USING btree ("tenant_id","reference_type","reference_id") WHERE "credit_ledger"."kind" = 'charge' and "credit_ledger"."reference_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_reversal_reference_idx" ON "credit_ledger" USING btree ("tenant_id","reference_type","reference_id") WHERE "credit_ledger"."kind" = 'reversal' and "credit_ledger"."reference_id" is not null;--> statement-breakpoint
CREATE INDEX "customers_tenant_id_idx" ON "customers" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "customers_tenant_name_idx" ON "customers" USING btree ("tenant_id",lower("name"));
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.customers');
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.credit_ledger');
--> statement-breakpoint
-- Customers are never deleted (active = false): no DELETE or TRUNCATE for app_user.
GRANT SELECT, INSERT, UPDATE ON "customers" TO "app_user";
--> statement-breakpoint
-- The credit ledger is append-only (hard rule 3, S6): app_user can read and insert, nothing else.
GRANT SELECT, INSERT ON "credit_ledger" TO "app_user";
--> statement-breakpoint
-- Defense in depth for every role, including the table owner. TRUNCATE is not blocked (tests reset with it).
CREATE FUNCTION "credit_ledger_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'credit_ledger is append-only: % is not allowed', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "credit_ledger_append_only"
	BEFORE UPDATE OR DELETE ON "credit_ledger"
	FOR EACH ROW EXECUTE FUNCTION "credit_ledger_reject_change"();
