import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps same-origin paths with query and hash', () => {
    // AC-3 (#14)
    expect(safeRedirectPath('/products?page=2#top')).toBe('/products?page=2#top');
  });

  it.each([
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example',
    '/\t/evil.example',
    '/\n/evil.example',
    'javascript:alert(1)',
    'products',
    '',
  ])('falls back for %j', (value) => {
    // AC-3 (#14): open redirect protection
    expect(safeRedirectPath(value)).toBe('/');
  });

  it('falls back when nothing or the login page itself is requested', () => {
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath('/login?redirect=%2F')).toBe('/');
    expect(safeRedirectPath('/login/')).toBe('/');
    expect(safeRedirectPath('/login#x')).toBe('/');
  });
});
