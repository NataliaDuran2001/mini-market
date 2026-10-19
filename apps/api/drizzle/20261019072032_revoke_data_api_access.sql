-- Supabase exposes the `public` schema through its Data API (PostgREST) and, by default, grants every
-- table created there to `anon` and `authenticated`, the roles of the public anon key and of any
-- signed-in browser session. This product has one door to the data, the API (ADR 0003: the browser
-- uses supabase-js for authentication only), and `users` and `invitations` have no row level
-- security by design (docs/05-security.md section 6). With the Supabase defaults an anonymous caller
-- could read their emails and invitation token hashes, and even delete rows.
-- So those two roles get nothing in `public`, now and for the tables later migrations create.
-- Functions: the existing ones lose the implicit EXECUTE of PUBLIC as well (they would be callable
-- through /rest/v1/rpc). A function created later needs its own `REVOKE ... FROM PUBLIC` unless it
-- returns `trigger`, which the Data API does not expose.
-- `service_role` is left alone (Supabase manages it; the API never uses it for data) and the roles
-- do not exist outside Supabase (PGlite, a plain Postgres), where the role part does nothing.
DO $$
DECLARE
	data_api_role text;
BEGIN
	FOREACH data_api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
		IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = data_api_role) THEN
			EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', data_api_role);
			EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', data_api_role);
			EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM %I', data_api_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', data_api_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', data_api_role);
			EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', data_api_role);
		END IF;
	END LOOP;
END
$$;
--> statement-breakpoint
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC;
