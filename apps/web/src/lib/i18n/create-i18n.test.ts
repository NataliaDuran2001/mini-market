import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createI18n, loadEsResources } from './create-i18n';

describe('createI18n', () => {
  it('loads one namespace per file under locales/es, including common', () => {
    const namespaces = Object.keys(loadEsResources());
    expect(namespaces).toEqual(expect.arrayContaining(['common', 'home', 'auth']));
  });

  it('has no single shared es.json (parallel-lane convention)', () => {
    expect(existsSync(path.resolve(import.meta.dirname, '../../locales/es.json'))).toBe(false);
    expect(existsSync(path.resolve(import.meta.dirname, '../../locales/es/es.json'))).toBe(false);
  });

  it('resolves es-BO to the Spanish messages', () => {
    // AC-1
    const i18n = createI18n();
    expect(i18n.language).toBe('es-BO');
    expect(i18n.t('home:title')).toBe('Bienvenido a Mini-Market');
    expect(i18n.t('notFound.title')).toBe('Página no encontrada');
  });
});
