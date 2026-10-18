import { createFileRoute } from '@tanstack/react-router';
import { requireSession, SelectTenantPage } from '@/features/auth';

export const Route = createFileRoute('/select-tenant')({
  beforeLoad: requireSession,
  component: SelectTenantPage,
});
