import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { AcceptInvitationPage } from '@/features/auth';

export const Route = createFileRoute('/accept-invitation')({
  validateSearch: z.object({ token: z.string().optional() }),
  component: function AcceptInvitation() {
    const { token } = Route.useSearch();
    return <AcceptInvitationPage token={token} />;
  },
});
