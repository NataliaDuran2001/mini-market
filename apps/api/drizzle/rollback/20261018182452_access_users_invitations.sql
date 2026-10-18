-- Rollback of 20261018182452_access_users_invitations. Run by hand, then remove the journal entry
-- and the snapshot of that migration. Only safe before any invitation is relied on.
DROP TABLE "invitations";
DROP TABLE "users";
