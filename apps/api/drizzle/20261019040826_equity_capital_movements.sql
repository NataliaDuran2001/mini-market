CREATE TABLE "capital_movements" (
	"tenant_id" uuid NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"amount_centavos" bigint NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"note" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "capital_movements_kind_check" CHECK ("capital_movements"."kind" in ('contribution', 'withdrawal')),
	CONSTRAINT "capital_movements_amount_check" CHECK ("capital_movements"."amount_centavos" > 0),
	CONSTRAINT "capital_movements_note_check" CHECK (char_length("capital_movements"."note") <= 500)
);
--> statement-breakpoint
ALTER TABLE "capital_movements" ADD CONSTRAINT "capital_movements_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "capital_movements_tenant_id_idx" ON "capital_movements" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "capital_movements_tenant_occurred_idx" ON "capital_movements" USING btree ("tenant_id","occurred_at");--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.capital_movements');
--> statement-breakpoint
-- The capital ledger is append-only (hard rule 3, S8): app_user can read and insert, nothing else.
GRANT SELECT, INSERT ON "capital_movements" TO "app_user";
--> statement-breakpoint
-- Defense in depth for every role, including the table owner. TRUNCATE is not blocked (tests reset with it).
CREATE FUNCTION "capital_movements_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'capital_movements is append-only: % is not allowed', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "capital_movements_append_only"
	BEFORE UPDATE OR DELETE ON "capital_movements"
	FOR EACH ROW EXECUTE FUNCTION "capital_movements_reject_change"();