import type { z } from 'zod';
import { ApiError, NETWORK_ERROR_CODE, UNKNOWN_ERROR_CODE } from './api-error';

/** REST prefix of every endpoint (docs/04-coding-standards.md section 6). */
export const API_PREFIX = '/api/v1';

export interface ApiRequestOptions<T> {
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  /** Validates the JSON response against the shared contract (ADR 0017). */
  readonly schema?: z.ZodType<T>;
}

export interface ApiClient {
  get<T>(path: string, options?: Omit<ApiRequestOptions<T>, 'body'>): Promise<T>;
  post<T>(path: string, options?: ApiRequestOptions<T>): Promise<T>;
  put<T>(path: string, options?: ApiRequestOptions<T>): Promise<T>;
  patch<T>(path: string, options?: ApiRequestOptions<T>): Promise<T>;
  delete<T>(path: string, options?: Omit<ApiRequestOptions<T>, 'body'>): Promise<T>;
}

export interface ApiClientConfig {
  /** API origin, for example `http://localhost:3001`; `/api/v1` is added by the client. */
  readonly baseUrl: string;
  /** Injectable for tests; defaults to the global fetch. */
  readonly fetch?: typeof fetch;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface ErrorBody {
  readonly code?: unknown;
  readonly message?: unknown;
  readonly details?: unknown;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body = await readJson(response);
  const parsed: ErrorBody = typeof body === 'object' && body !== null ? body : {};
  return new ApiError({
    status: response.status,
    code: typeof parsed.code === 'string' ? parsed.code : UNKNOWN_ERROR_CODE,
    ...(typeof parsed.message === 'string' ? { message: parsed.message } : {}),
    details: parsed.details,
  });
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function createApiClient(config: ApiClientConfig): ApiClient {
  const base = config.baseUrl.replace(/\/+$/, '') + API_PREFIX;

  async function request<T>(
    method: Method,
    path: string,
    options: ApiRequestOptions<T> = {},
  ): Promise<T> {
    const doFetch = config.fetch ?? fetch;
    const hasBody = options.body !== undefined;
    let response: Response;
    try {
      response = await doFetch(`${base}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
      throw new ApiError({ status: 0, code: NETWORK_ERROR_CODE });
    }
    if (!response.ok) throw await toApiError(response);
    const json = await readJson(response);
    // Empty bodies (204) and unvalidated calls: the caller declares the type it expects.
    return (options.schema ? options.schema.parse(json) : json) as T;
  }

  return {
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
    put: (path, options) => request('PUT', path, options),
    patch: (path, options) => request('PATCH', path, options),
    delete: (path, options) => request('DELETE', path, options),
  };
}
