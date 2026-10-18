import { http, HttpResponse } from 'msw';
import { apiUrl } from '../api-url';

// Default handlers: one file per feature in this folder, collected by server.ts through a glob.
export const handlers = [
  http.get(apiUrl('/health'), () => HttpResponse.json({ status: 'ok', version: 'test' })),
];
