-- Rollback of 20261019072032_revoke_data_api_access. Run by hand, then remove the journal entry and
-- the snapshot of that migration. It restores the Supabase defaults, which expose `users` and
-- `invitations` to the anon key: only do it to debug, never on a project with data.
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO PUBLIC;
--> statement-breakpoint
DO $$
DECLARE
	data_api_role text;
BEGIN
	FOREACH data_api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role) THEN
			EXECUTE format('GRANT ALL ON ALL TABLES IN SCHEMA public TO %I', data_api_role);
			EXECUTE format('GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO %I', data_api_role);
			EXECUTE format('GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO %I', data_api_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO %I', data_api_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO %I', data_api_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO %I', data_api_role);
		END IF;
	END LOOP;
END
$$;
