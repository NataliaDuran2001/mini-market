-- Rollback of 20261018210511_rls_app_user. Run by hand, then remove the journal entry and the
-- snapshot of that migration. Tenant isolation is off afterwards: only for a throwaway database.
DROP POLICY "member_tenants" ON "tenants";
DROP POLICY "tenant_isolation" ON "tenants";
ALTER TABLE "tenants" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "tenants" DISABLE ROW LEVEL SECURITY;
DROP POLICY "own_rows" ON "memberships";
DROP POLICY "tenant_isolation" ON "memberships";
ALTER TABLE "memberships" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "memberships" DISABLE ROW LEVEL SECURITY;
DROP POLICY "tenant_isolation" ON "audit_log";
ALTER TABLE "audit_log" NO FORCE ROW LEVEL SECURITY;
ALTER TABLE "audit_log" DISABLE ROW LEVEL SECURITY;
DROP FUNCTION "app"."enable_tenant_rls"(regclass);
DROP FUNCTION "app"."current_user_id"();
DROP FUNCTION "app"."current_tenant_id"();
DROP SCHEMA "app";
DROP OWNED BY "app_user";
DROP ROLE "app_user";
