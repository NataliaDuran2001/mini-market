const PROBE_ORIGIN = 'http://redirect.invalid';

function hasControlOrBackslash(value: string): boolean {
  return [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= 0x1f || code === 0x7f || char === '\\';
  });
}

/**
 * Where to go after login. Only same-origin absolute paths are accepted, so a crafted
 * `?redirect=https://evil.example`, `//evil.example` or `/%09/evil.example` link cannot send the
 * person elsewhere, and the login page itself is never a destination.
 */
export function safeRedirectPath(value: string | undefined | null, fallback = '/'): string {
  if (!value?.startsWith('/') || value.startsWith('//') || hasControlOrBackslash(value)) {
    return fallback;
  }
  const url = new URL(value, PROBE_ORIGIN);
  if (url.origin !== PROBE_ORIGIN) return fallback;
  if (url.pathname.replace(/\/+$/, '') === '/login') return fallback;
  return value;
}
