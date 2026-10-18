/**
 * Where to go after login. Only same-origin absolute paths are accepted, so a crafted
 * `?redirect=https://evil.example` or `//evil.example` link cannot send the person elsewhere.
 */
export function safeRedirectPath(value: string | undefined | null, fallback = '/'): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value === '/login' || value.startsWith('/login?')) return fallback;
  return value;
}
