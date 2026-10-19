import type { i18n } from 'i18next';
import { ApiError } from '@/lib/api/api-error';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { translateKey } from '@/lib/i18n/translate-key';

/**
 * Spanish text for a failed members or invitations call: the codes of this feature live in
 * `team:errors`, every other code falls back to the shared `common:errors.codes`.
 */
export function teamErrorMessage(instance: i18n, error: unknown): string {
  const fallback = apiErrorMessage(instance, error);
  return error instanceof ApiError
    ? translateKey(instance, `team:errors.${error.code}`, fallback)
    : fallback;
}
