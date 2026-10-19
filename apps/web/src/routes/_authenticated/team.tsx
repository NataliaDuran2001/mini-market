import { createFileRoute } from '@tanstack/react-router';
import { requirePermission } from '@/features/auth';
import { TeamPage } from '@/features/team';

// Owner only (docs/01-domain.md section 4): an employee lands on the "sin permiso" page. The API
// enforces `members.manage` again on every call.
export const Route = createFileRoute('/_authenticated/team')({
  beforeLoad: requirePermission('members.manage'),
  component: TeamPage,
});
