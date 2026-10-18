import i18next, { type i18n } from 'i18next';
import { initReactI18next } from 'react-i18next';

export const DEFAULT_LOCALE = 'es-BO';
export const DEFAULT_NAMESPACE = 'common';

// One JSON file per feature under src/locales/es (plus common.json). Loaded by glob so that no
// shared file lists the namespaces and lanes adding a feature never touch the same lines.
const esModules = import.meta.glob<Record<string, unknown>>('../../locales/es/*.json', {
  eager: true,
  import: 'default',
});

export function loadEsResources(): Record<string, Record<string, unknown>> {
  return Object.fromEntries(
    Object.entries(esModules).map(([file, messages]) => [
      file.replace(/^.*\/(.+)\.json$/, '$1'),
      messages,
    ]),
  );
}

/** A fresh instance per app or test: no module-level singleton (ADR 0016). */
export function createI18n(): i18n {
  const resources = loadEsResources();
  const instance = i18next.createInstance();
  void instance.use(initReactI18next).init({
    lng: DEFAULT_LOCALE,
    fallbackLng: 'es',
    ns: Object.keys(resources),
    defaultNS: DEFAULT_NAMESPACE,
    resources: { es: resources },
    interpolation: { escapeValue: false },
    initAsync: false,
  });
  return instance;
}
