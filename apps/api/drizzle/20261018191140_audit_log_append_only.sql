-- audit_log is append-only (docs/05-security.md section 3, hard rule 3): reject UPDATE and DELETE
-- for every role, including the owner of the table. TRUNCATE is not blocked (tests reset with it).
CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'audit_log is append-only: % is not allowed', TG_OP USING ERRCODE = 'integrity_constraint_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "audit_log_append_only"
	BEFORE UPDATE OR DELETE ON "audit_log"
	FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();
