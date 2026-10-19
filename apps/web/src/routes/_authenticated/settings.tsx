import { createFileRoute } from '@tanstack/react-router';
import { requirePermission } from '@/features/auth';
import { SettingsPage } from '@/features/settings';

// Owner only (docs/01-domain.md section 4): an employee lands on the "sin permiso" page. The API
// enforces `settings.write` again on every change.
export const Route = createFileRoute('/_authenticated/settings')({
  beforeLoad: requirePermission('settings.write'),
  component: SettingsPage,
});
