import { updateTenantSettingsSchema, type TenantResponse } from '@mini-market/contracts/tenancy';
import { http, HttpResponse, type RequestHandler } from 'msw';
import { apiUrl } from '../api-url';

/**
 * `GET /tenant` and `PATCH /tenant/settings` over one tenant kept in memory: the patch merges the
 * flags like the real endpoint, so a test sees the settings the screen saved in `tenant()`.
 */
export function tenantSettingsApi(initial: TenantResponse) {
  let tenant = initial;
  const handlers: RequestHandler[] = [
    http.get(apiUrl('/tenant'), () => HttpResponse.json(tenant)),
    http.patch(apiUrl('/tenant/settings'), async ({ request }) => {
      const patch = updateTenantSettingsSchema.parse(await request.json());
      tenant = {
        ...tenant,
        settings: {
          ...tenant.settings,
          ...(patch.allowNegativeStock === undefined
            ? {}
            : { allowNegativeStock: patch.allowNegativeStock }),
          ...(patch.employeeCanVoid === undefined
            ? {}
            : { employeeCanVoid: patch.employeeCanVoid }),
        },
      };
      return HttpResponse.json(tenant);
    }),
  ];
  return { handlers, tenant: () => tenant };
}

// The default tenant answers come from ./tenancy.ts; this file only adds the stateful helper.
export const handlers: RequestHandler[] = [];
