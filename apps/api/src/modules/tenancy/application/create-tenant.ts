import { createTenantInputSchema } from '@mini-market/contracts/tenancy';
import type { CreateTenantInput } from '@mini-market/contracts/tenancy';
import { andThen, err, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Clock, ConflictError, Result } from '@mini-market/shared-kernel';
import { presetFor } from '../domain/presets';
import type { TenantCreated } from '../domain/tenant-events';
import { parseSettings } from './parse-settings';
import { validationDetails } from './validation-details';
import type { EventPublisher } from './ports/event-publisher';
import type { TenantRepository } from './ports/tenant.repository';
import type { TenantView } from './tenant-view';

export interface CreateTenantDeps {
  readonly tenants: TenantRepository;
  readonly events: EventPublisher;
  readonly clock: Clock;
}

export type CreateTenant = (
  input: CreateTenantInput,
) => Promise<Result<TenantView, ValidationError | ConflictError>>;

export const CREATE_TENANT = Symbol('CREATE_TENANT');

/**
 * Provisions a tenant with the settings of its vertical preset. Called by the operator script,
 * not by a public endpoint, so there is no TenantContext and no permission check here.
 */
export async function createTenant(
  deps: CreateTenantDeps,
  input: CreateTenantInput,
): Promise<Result<TenantView, ValidationError | ConflictError>> {
  const parsed = createTenantInputSchema.safeParse(input);
  if (!parsed.success) {
    return err(new ValidationError('Tenant input is invalid', validationDetails(parsed.error)));
  }
  const { name, slug, vertical } = parsed.data;
  const stored = await deps.tenants.create({
    name,
    slug,
    settings: presetFor(vertical),
    createdAt: deps.clock.now(),
  });
  const view = andThen(stored, (row) => {
    const settings = parseSettings(row.settings);
    return settings.ok
      ? ok({ id: row.id, slug: row.slug, name: row.name, settings: settings.value })
      : settings;
  });
  if (view.ok) {
    const event: TenantCreated = {
      type: 'TenantCreated',
      tenantId: view.value.id,
      slug: view.value.slug,
      vertical,
      settings: view.value.settings,
      occurredAt: deps.clock.now(),
    };
    await deps.events.publish([event]);
  }
  return view;
}
