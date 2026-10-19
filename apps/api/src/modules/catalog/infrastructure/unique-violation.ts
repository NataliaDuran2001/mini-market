const UNIQUE_VIOLATION = '23505';

/** Driver errors carry the SQLSTATE in `code`; Drizzle wraps them, so look at the causes too. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    if ('code' in current && current.code === UNIQUE_VIOLATION) return true;
    current = current.cause;
  }
  return false;
}
