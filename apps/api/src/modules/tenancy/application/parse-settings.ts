import { tenantSettingsSchema } from '@mini-market/contracts/tenancy';
import { err, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import type { TenantSettings } from '../domain/tenant';
import { validationDetails } from './validation-details';

/**
 * Validates settings read from storage or produced by a merge. Missing keys take their defaults,
 * so rows written before a key existed keep working. Stored data that is invalid (a bug or a manual
 * edit) is reported as a Validation error, never trusted.
 */
export function parseSettings(raw: unknown): Result<TenantSettings, ValidationError> {
  const parsed = tenantSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return err(new ValidationError('Tenant settings are invalid', validationDetails(parsed.error)));
  }
  const settings: TenantSettings = parsed.data; // compile-time check: schema and domain types agree
  return ok(settings);
}
