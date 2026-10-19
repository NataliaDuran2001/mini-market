CREATE TABLE "suppliers" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"tax_id" text,
	"notes" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suppliers_tenant_id_idx" ON "suppliers" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_tenant_name_idx" ON "suppliers" USING btree ("tenant_id",lower("name"));
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.suppliers');
--> statement-breakpoint
-- Suppliers are never deleted (active = false): no DELETE or TRUNCATE for app_user.
GRANT SELECT, INSERT, UPDATE ON "suppliers" TO "app_user";
