import { updateTenantSettingsSchema } from '@mini-market/contracts/tenancy';
import type { UpdateTenantSettingsInput } from '@mini-market/contracts/tenancy';
import { andThen, err, ForbiddenError, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Clock, NotFoundError, Result } from '@mini-market/shared-kernel';
import { applySettingsPatch } from '../domain/tenant';
import type { TenantSettings } from '../domain/tenant';
import type { TenantSettingsChanged } from '../domain/tenant-events';
import { parseSettings } from './parse-settings';
import { validationDetails } from './validation-details';
import type { TenantRepository } from './ports/tenant.repository';
import type { TenantScope } from './tenant-scope';
import type { TenantView } from './tenant-view';

export interface UpdateTenantSettingsDeps {
  readonly tenants: TenantRepository;
  readonly clock: Clock;
}

type UpdateError = ForbiddenError | ValidationError | NotFoundError;

export type UpdateTenantSettings = (
  ctx: TenantScope,
  patch: UpdateTenantSettingsInput,
) => Promise<Result<TenantView, UpdateError>>;

export const UPDATE_TENANT_SETTINGS = Symbol('UPDATE_TENANT_SETTINGS');

/** Owner only. The patch is validated, keys missing from it keep their value. */
export async function updateTenantSettings(
  deps: UpdateTenantSettingsDeps,
  ctx: TenantScope,
  patch: UpdateTenantSettingsInput,
): Promise<Result<TenantView, UpdateError>> {
  if (ctx.role !== 'owner') {
    return err(new ForbiddenError('Only the owner can change tenant settings'));
  }
  const parsedPatch = updateTenantSettingsSchema.safeParse(patch);
  if (!parsedPatch.success) {
    return err(
      new ValidationError('Settings patch is invalid', validationDetails(parsedPatch.error)),
    );
  }
  const now = deps.clock.now();
  const updated = await deps.tenants.updateSettings(
    ctx,
    (current) =>
      andThen(parseSettings(current.settings), (before): Result<TenantSettings, never> => {
        const after = applySettingsPatch(before, parsedPatch.data);
        const event: TenantSettingsChanged = {
          type: 'TenantSettingsChanged',
          tenantId: ctx.tenantId,
          userId: ctx.userId,
          before,
          after,
          occurredAt: now,
        };
        ctx.events.push(event); // dispatched after commit, dropped on rollback (ADR 0014)
        return ok(after);
      }),
    now,
  );
  return andThen(updated, (row) =>
    andThen(parseSettings(row.settings), (settings): Result<TenantView, never> =>
      ok({ id: row.id, slug: row.slug, name: row.name, settings }),
    ),
  );
}
