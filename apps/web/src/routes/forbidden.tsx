import { createFileRoute } from '@tanstack/react-router';
import { ForbiddenPage, requireSession } from '@/features/auth';

export const Route = createFileRoute('/forbidden')({
  beforeLoad: requireSession,
  component: ForbiddenPage,
});
