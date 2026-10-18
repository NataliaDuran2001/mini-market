import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppProviders } from '@/app/providers';
import { DevTools } from '@/app/dev-tools';
import { createAppRouter } from '@/app/router';
import { createApiClient } from '@/lib/api/client';
import { env } from '@/lib/env';
import { createI18n } from '@/lib/i18n/create-i18n';
import { createQueryClient } from '@/lib/query-client';
import './index.css';

const queryClient = createQueryClient();
const apiClient = createApiClient({ baseUrl: env.VITE_API_URL });
const i18n = createI18n();
const router = createAppRouter();

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders queryClient={queryClient} apiClient={apiClient} i18n={i18n}>
      <RouterProvider router={router} />
      <DevTools />
    </AppProviders>
  </StrictMode>,
);
// ci demo: web-only change
