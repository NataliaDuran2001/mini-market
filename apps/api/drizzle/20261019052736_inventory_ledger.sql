CREATE TABLE "stock_levels" (
	"tenant_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity" numeric(14, 3) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_pk" PRIMARY KEY("tenant_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_cost_centavos" bigint,
	"reference_type" text,
	"reference_id" text,
	"reason" text,
	"lot_id" uuid,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_kind_check" CHECK ("stock_movements"."kind" in ('initial', 'purchase', 'sale', 'adjustment', 'void', 'expired')),
	CONSTRAINT "stock_movements_quantity_not_zero" CHECK ("stock_movements"."quantity" <> 0),
	CONSTRAINT "stock_movements_unit_cost_not_negative" CHECK ("stock_movements"."unit_cost_centavos" is null or "stock_movements"."unit_cost_centavos" >= 0),
	CONSTRAINT "stock_movements_adjustment_reason" CHECK ("stock_movements"."kind" <> 'adjustment' or length(btrim("stock_movements"."reason")) > 0)
);
--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_levels_tenant_id_idx" ON "stock_levels" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_tenant_id_idx" ON "stock_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "stock_movements_product_idx" ON "stock_movements" USING btree ("tenant_id","product_id","created_at");--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.stock_movements');--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.stock_levels');--> statement-breakpoint
-- The stock ledger is append-only (hard rule 3, ADR 0005): app_user reads and inserts movements,
-- nothing else. stock_levels is derived data kept by recordMovements, so it may be updated.
GRANT SELECT, INSERT ON "stock_movements" TO "app_user";--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "stock_levels" TO "app_user";--> statement-breakpoint
-- Defense in depth for every role, including the table owner. TRUNCATE is not blocked (tests reset with it).
CREATE FUNCTION "stock_movements_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'stock_movements is append-only: % is not allowed', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "stock_movements_append_only"
	BEFORE UPDATE OR DELETE ON "stock_movements"
	FOR EACH ROW EXECUTE FUNCTION "stock_movements_reject_change"();