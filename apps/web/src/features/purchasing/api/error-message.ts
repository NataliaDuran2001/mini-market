import type { i18n } from 'i18next';
import { apiErrorMessage } from '@/lib/api/api-error-message';
import { ApiError } from '@/lib/api/api-error';
import { translateKey } from '@/lib/i18n/translate-key';

/**
 * Spanish text for a failed purchasing call: the codes of this feature live in `purchasing:errors`,
 * every other code falls back to the shared `common:errors.codes`.
 */
export function purchasingErrorMessage(instance: i18n, error: unknown): string {
  const fallback = apiErrorMessage(instance, error);
  return error instanceof ApiError
    ? translateKey(instance, `purchasing:errors.${error.code}`, fallback)
    : fallback;
}
