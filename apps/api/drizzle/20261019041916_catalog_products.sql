CREATE TABLE "product_presentations" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"name" text NOT NULL,
	"factor" integer NOT NULL,
	"sale_price_centavos" bigint NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_presentations_factor_positive" CHECK ("product_presentations"."factor" >= 1),
	CONSTRAINT "product_presentations_price_positive" CHECK ("product_presentations"."sale_price_centavos" > 0)
);
--> statement-breakpoint
CREATE TABLE "products" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"category_id" uuid,
	"base_unit_id" uuid NOT NULL,
	"sale_price_centavos" bigint NOT NULL,
	"avg_cost_centavos" bigint DEFAULT 0 NOT NULL,
	"min_stock" numeric(14, 3) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_name_not_blank" CHECK (length(btrim("products"."name")) > 0),
	CONSTRAINT "products_sale_price_positive" CHECK ("products"."sale_price_centavos" > 0),
	CONSTRAINT "products_avg_cost_not_negative" CHECK ("products"."avg_cost_centavos" >= 0),
	CONSTRAINT "products_min_stock_not_negative" CHECK ("products"."min_stock" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_presentations" ADD CONSTRAINT "product_presentations_product_fk" FOREIGN KEY ("tenant_id","product_id") REFERENCES "public"."products"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_fk" FOREIGN KEY ("tenant_id","category_id") REFERENCES "public"."categories"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_base_unit_fk" FOREIGN KEY ("tenant_id","base_unit_id") REFERENCES "public"."units"("tenant_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_presentations_tenant_id_idx" ON "product_presentations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "product_presentations_product_idx" ON "product_presentations" USING btree ("tenant_id","product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_presentations_default_idx" ON "product_presentations" USING btree ("product_id") WHERE "product_presentations"."is_default";--> statement-breakpoint
CREATE INDEX "products_tenant_id_idx" ON "products" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_code_idx" ON "products" USING btree ("tenant_id",lower("code")) WHERE "products"."code" is not null;--> statement-breakpoint
CREATE INDEX "products_tenant_name_idx" ON "products" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "products_tenant_id_id_idx" ON "products" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "categories_tenant_id_id_idx" ON "categories" USING btree ("tenant_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "units_tenant_id_id_idx" ON "units" USING btree ("tenant_id","id");