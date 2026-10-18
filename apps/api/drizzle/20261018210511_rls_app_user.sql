-- Row level security (ADR 0001, docs/05-security.md): the API connects as `app_user`, which cannot
-- bypass RLS, and every transaction binds `app.tenant_id` (and `app.user_id`) with set_config.
-- Migrations run with the owner role. In Supabase the operator gives the role a password by hand
-- (`ALTER ROLE app_user LOGIN PASSWORD '...'`); no secret lives in the repository.
CREATE SCHEMA IF NOT EXISTS "app";
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
		CREATE ROLE "app_user" NOLOGIN NOBYPASSRLS;
	END IF;
	-- A pre-existing role that can bypass RLS would silently turn isolation off: refuse it.
	IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user' AND (rolbypassrls OR rolsuper)) THEN
		RAISE EXCEPTION 'role app_user can bypass row level security';
	END IF;
END
$$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA "public" TO "app_user";
--> statement-breakpoint
GRANT USAGE ON SCHEMA "app" TO "app_user";
--> statement-breakpoint
-- Unset or empty means "no tenant": every policy compares against NULL and matches nothing.
CREATE FUNCTION "app"."current_tenant_id"() RETURNS uuid
	LANGUAGE sql STABLE
	AS $$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
--> statement-breakpoint
CREATE FUNCTION "app"."current_user_id"() RETURNS uuid
	LANGUAGE sql STABLE
	AS $$ SELECT nullif(current_setting('app.user_id', true), '')::uuid $$;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION "app"."current_tenant_id"(), "app"."current_user_id"() TO "app_user";
--> statement-breakpoint
-- Policy template for a table with a `tenant_id` column. Every later migration that creates a
-- tenant table calls it: SELECT app.enable_tenant_rls('public.sales');
CREATE FUNCTION "app"."enable_tenant_rls"(target regclass) RETURNS void
	LANGUAGE plpgsql
	AS $$
BEGIN
	EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', target);
	EXECUTE format('ALTER TABLE %s FORCE ROW LEVEL SECURITY', target);
	EXECUTE format(
		'CREATE POLICY tenant_isolation ON %s USING (tenant_id = app.current_tenant_id()) WITH CHECK (tenant_id = app.current_tenant_id())',
		target
	);
END
$$;
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.memberships');
--> statement-breakpoint
SELECT "app"."enable_tenant_rls"('public.audit_log');
--> statement-breakpoint
-- A user reads their own memberships before choosing a tenant (GET /me/tenants). Only while no tenant
-- is bound: once a tenant is bound, the tenant policy is the only wall.
CREATE POLICY "own_rows" ON "memberships" FOR SELECT
	USING ("app"."current_tenant_id"() IS NULL AND user_id = "app"."current_user_id"());
--> statement-breakpoint
-- tenants has no tenant_id: its id is the tenant id.
ALTER TABLE "tenants" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "tenants" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenants"
	USING (id = "app"."current_tenant_id"())
	WITH CHECK (id = "app"."current_tenant_id"());
--> statement-breakpoint
CREATE POLICY "member_tenants" ON "tenants" FOR SELECT
	USING (
		"app"."current_tenant_id"() IS NULL
		AND id IN (SELECT tenant_id FROM "memberships" WHERE user_id = "app"."current_user_id"())
	);
--> statement-breakpoint
-- Grants are explicit per table. Tenants are created by the provisioning script with the owner
-- role, memberships are never deleted, and the audit log is append-only: no UPDATE, DELETE or
-- TRUNCATE for app_user. `users` and `invitations` have no tenant policy (see schema.ts).
GRANT SELECT, UPDATE ON "tenants" TO "app_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "memberships" TO "app_user";
--> statement-breakpoint
GRANT SELECT, INSERT ON "audit_log" TO "app_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "users" TO "app_user";
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON "invitations" TO "app_user";
