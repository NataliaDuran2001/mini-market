import { http, HttpResponse } from 'msw';
import { apiUrl } from '../api-url';

export const OWNER_TENANT = {
  tenantId: '11111111-1111-4111-8111-111111111111',
  slug: 'tienda-ana',
  name: 'Tienda Ana',
  role: 'owner',
} as const;

export const EMPLOYEE_TENANT = { ...OWNER_TENANT, role: 'employee' } as const;

export const SECOND_TENANT = {
  tenantId: '22222222-2222-4222-8222-222222222222',
  slug: 'farmacia-sol',
  name: 'Farmacia Sol',
  role: 'owner',
} as const;

// Default: one business where the person is the owner. Tests override with server.use(...).
export const handlers = [
  http.get(apiUrl('/me/tenants'), () => HttpResponse.json({ items: [OWNER_TENANT] })),
];
