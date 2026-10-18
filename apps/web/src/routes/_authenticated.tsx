import { createFileRoute } from '@tanstack/react-router';
import { AuthenticatedLayout } from '@/app/layout/authenticated-layout';
import { requireAuth } from '@/features/auth';

// Every signed-in screen lives under src/routes/_authenticated/. Guarded routes add
// `beforeLoad: requirePermission('<permission>')` on top of this one.
export const Route = createFileRoute('/_authenticated')({
  beforeLoad: requireAuth,
  component: AuthenticatedLayout,
});
