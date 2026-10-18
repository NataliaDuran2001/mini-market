export interface ErrorDescription {
  readonly name: string;
  readonly message: string;
  /** Postgres error code (for example `23505`) when the error wraps one. */
  readonly code?: string;
  readonly cause?: string;
}

// drizzle-orm's DrizzleQueryError puts the bound parameters (customer data, amounts) in its message.
const PARAMS_MARKER = '\nparams:';

const withoutParams = (message: string): string => {
  const index = message.indexOf(PARAMS_MARKER);
  return index === -1 ? message : message.slice(0, index);
};

/**
 * What is safe to log about a failure: no bound query parameters, no stack frames with values.
 * Use it instead of passing an `Error` to the logger when the error may come from the database.
 */
export function describeError(error: unknown): ErrorDescription {
  if (!(error instanceof Error)) {
    return { name: 'NonErrorThrown', message: typeof error };
  }
  const cause = error.cause instanceof Error ? error.cause : undefined;
  const code = (cause ?? error) as { code?: unknown }; // pg errors carry a string `code`
  return {
    name: error.name,
    message: withoutParams(error.message),
    ...(typeof code.code === 'string' ? { code: code.code } : {}),
    ...(cause ? { cause: withoutParams(cause.message) } : {}),
  };
}
