import { API_PREFIX } from '@/lib/api/client';
import { env } from '@/lib/env';

/** Absolute URL of an API endpoint as the client calls it, for MSW handlers: `apiUrl('/health')`. */
export function apiUrl(path: string): string {
  return `${env.VITE_API_URL.replace(/\/+$/, '')}${API_PREFIX}${path}`;
}
