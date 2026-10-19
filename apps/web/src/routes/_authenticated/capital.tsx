import { createFileRoute } from '@tanstack/react-router';
import { requirePermission } from '@/features/auth';
import { CapitalPage } from '@/features/equity';

// Owner only (S8): an employee lands on the "sin permiso" page. The API enforces it again.
export const Route = createFileRoute('/_authenticated/capital')({
  beforeLoad: requirePermission('equity.read'),
  component: CapitalPage,
});
