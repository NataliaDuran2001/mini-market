import { createFileRoute } from '@tanstack/react-router';
import { DashboardPage } from '@/app/shell/dashboard-page';

export const Route = createFileRoute('/_authenticated/')({ component: DashboardPage });
