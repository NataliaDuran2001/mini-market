import { z } from 'zod';

/** Public build-time configuration. Never put the Supabase service role key here (ADR 0003). */
export const envSchema = z.object({
  VITE_API_URL: z.url(),
  VITE_SUPABASE_URL: z.url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

/** Throws listing only the offending variable names, never their values. */
export function parseEnv(source: Record<string, unknown>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Invalid web environment, check: ${keys.join(', ')}`);
  }
  return result.data;
}

/** Validated configuration: the one module-level value allowed by ADR 0016. */
export const env = parseEnv(import.meta.env);
