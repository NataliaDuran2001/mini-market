import type { i18n } from 'i18next';
import { translateKey } from '../i18n/translate-key';
import { ApiError } from './api-error';

/**
 * Spanish text for an API failure, looked up by the stable error code in
 * `common:errors.codes.<CODE>`. The server message is never shown (ADR 0012).
 */
export function apiErrorMessage(instance: i18n, error: unknown): string {
  const fallback = instance.t('errors.generic', { ns: 'common' });
  if (!(error instanceof ApiError)) return fallback;
  return translateKey(instance, `common:errors.codes.${error.code}`, fallback);
}
