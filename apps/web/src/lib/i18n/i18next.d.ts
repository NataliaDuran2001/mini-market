import type { EsResources } from './resources.gen';

// Typed keys: t('title') is checked against the namespace passed to useTranslation('<feature>').
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: EsResources;
  }
}
