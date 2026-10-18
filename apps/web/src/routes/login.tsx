import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginPage } from '@/features/auth';

export const Route = createFileRoute('/login')({
  validateSearch: z.object({ redirect: z.string().optional() }),
  component: function Login() {
    const { redirect } = Route.useSearch();
    return <LoginPage redirect={redirect} />;
  },
});
