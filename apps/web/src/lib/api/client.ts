import type { z } from 'zod';
import { ApiError, NETWORK_ERROR_CODE, UNKNOWN_ERROR_CODE } from './api-error';

/** REST prefix of every endpoint (docs/04-coding-standards.md section 6). */
export const API_PREFIX = '/api/v1';

interface RequestBase {
  readonly headers?: Readonly<Record<string, string>>;
  readonly signal?: AbortSignal;
}

export interface ApiReadOptions<T> extends RequestBase {
  /** Validates the JSON response against the shared contract (ADR 0017); required, never cast. */
  readonly schema: z.ZodType<T>;
}

export interface ApiWriteOptions<T> extends ApiReadOptions<T> {
  readonly body?: unknown;
}

export interface ApiClient {
  get<T>(path: string, options: ApiReadOptions<T>): Promise<T>;
  post<T>(path: string, options: ApiWriteOptions<T>): Promise<T>;
  put<T>(path: string, options: ApiWriteOptions<T>): Promise<T>;
  patch<T>(path: string, options: ApiWriteOptions<T>): Promise<T>;
  /** For endpoints that answer 204 with no body. */
  delete(path: string, options?: RequestBase): Promise<void>;
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

  async function send(
    method: Method,
    path: string,
    options: RequestBase & { readonly body?: unknown },
  ): Promise<unknown> {
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
    return readJson(response);
  }

  const read = async <T>(method: Method, path: string, options: ApiWriteOptions<T>) =>
    options.schema.parse(await send(method, path, options));

  return {
    get: (path, options) => read('GET', path, options),
    post: (path, options) => read('POST', path, options),
    put: (path, options) => read('PUT', path, options),
    patch: (path, options) => read('PATCH', path, options),
    delete: async (path, options = {}) => {
      await send('DELETE', path, options);
    },
  };
}
