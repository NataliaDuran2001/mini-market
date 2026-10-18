import type { TenantResponse } from '@mini-market/contracts/tenancy';
import { http, HttpResponse } from 'msw';
import { apiUrl } from '../api-url';
import { OWNER_TENANT, SECOND_TENANT } from './access';

export function aTenant(
  base: { tenantId: string; slug: string; name: string },
  settings: {
    modules?: Partial<TenantResponse['settings']['modules']>;
    employeeCanVoid?: boolean;
  } = {},
): TenantResponse {
  return {
    id: base.tenantId,
    slug: base.slug,
    name: base.name,
    settings: {
      vertical: 'minimarket',
      modules: {
        lots: false,
        fractional: false,
        credit_sales: true,
        custom_fields: false,
        ...settings.modules,
      },
      allowNegativeStock: false,
      employeeCanVoid: settings.employeeCanVoid ?? false,
      timezone: 'America/La_Paz',
      currency: 'BOB',
    },
  };
}

// Default: the business named in X-Tenant-Id, a minimarket with credit sales on.
export const handlers = [
  http.get(apiUrl('/tenant'), ({ request }) => {
    const tenantId = request.headers.get('x-tenant-id');
    const base = tenantId === SECOND_TENANT.tenantId ? SECOND_TENANT : OWNER_TENANT;
    return HttpResponse.json(aTenant(base));
  }),
];
