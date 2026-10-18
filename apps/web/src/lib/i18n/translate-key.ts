import type { i18n } from 'i18next';

/**
 * Translates a key that arrives as data (a Zod issue message, an API error code mapped to a key).
 * Static keys in components go through the typed `t()`; this is only for keys known at runtime.
 */
export function translateKey(instance: i18n, key: string, fallback: string): string {
  // as: key is runtime data, so the typed t() cannot check it at compile time.
  return instance.exists(key) ? String(instance.t(key as never)) : fallback;
}
