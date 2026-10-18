import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createAppServices } from '@/app/create-app';
import { DevTools } from '@/app/dev-tools';
import { AppProviders } from '@/app/providers';
import { createSupabaseAuthGateway, createSupabaseClient } from '@/lib/auth/supabase-auth-gateway';
import { createTenantStore } from '@/lib/auth/tenant-store';
import { env } from '@/lib/env';
import './index.css';

const supabase = createSupabaseClient({
  url: env.VITE_SUPABASE_URL,
  anonKey: env.VITE_SUPABASE_ANON_KEY,
});
const services = createAppServices({
  apiBaseUrl: env.VITE_API_URL,
  gateway: createSupabaseAuthGateway(supabase),
  tenantStore: createTenantStore(),
});

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root element');

createRoot(container).render(
  <StrictMode>
    <AppProviders
      queryClient={services.queryClient}
      apiClient={services.apiClient}
      i18n={services.i18n}
      gateway={services.gateway}
      tenantStore={services.tenantStore}
    >
      <RouterProvider router={services.router} />
      <DevTools />
    </AppProviders>
  </StrictMode>,
);
