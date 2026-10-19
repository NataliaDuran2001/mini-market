// Pure mapping from the operator's secrets file to the two gitignored `.env` files of the local
// run (issue #97). No IO here: `setup-env.ts` reads and writes the files, and this module is the
// part that decides which value goes where. It never puts a value in an error message.
import { createHmac } from 'node:crypto';

/** Supabase pooler of the `sa-east-1` dev project. Override with `SUPABASE_POOLER_HOST`. */
export const DEFAULT_POOLER_HOST = 'aws-1-sa-east-1.pooler.supabase.com';
export const DEFAULT_API_PORT = '3001';
export const DEFAULT_WEB_PORT = '5173';

/** Variables the secrets file must define. */
export const REQUIRED_SECRETS = [
  'SUPABASE_PROJECT_REF',
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_PASSWORD',
] as const;

/** Keys the web file may contain: public values only (ADR 0003, docs/05-security.md section 5). */
export const WEB_ENV_KEYS = [
  'VITE_API_URL',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'WEB_PORT',
] as const;

/** The secrets file is missing or incomplete. The message names variables, never values. */
export class SecretsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SecretsError';
  }
}

export interface BuildEnvInput {
  /** Parsed secrets file (and nothing else). */
  readonly secrets: Readonly<Record<string, string | undefined>>;
  readonly apiPort?: string | undefined;
  readonly webPort?: string | undefined;
}

export interface BuiltEnv {
  readonly apiEnv: string;
  readonly webEnv: string;
  /** Variable names written to each file, for the report. Never values. */
  readonly apiKeys: readonly string[];
  readonly webKeys: readonly string[];
}

/**
 * A password derived from a secret of the secrets file, so every checkout and worktree of the same
 * operator computes the same value: no checkout can invalidate another one's `app_user` login.
 * Without the secret it cannot be recomputed.
 */
export const derivePassword = (secret: string, purpose: string): string =>
  createHmac('sha256', secret).update(`mini-market:${purpose}`).digest('base64url');

const isPort = (value: string): boolean => /^\d{1,5}$/.test(value) && Number(value) <= 65535;

function render(entries: readonly (readonly [string, string])[], header: string): string {
  for (const [key, value] of entries) {
    if (/[\r\n]/.test(value)) throw new SecretsError(`${key} must not contain a line break`);
  }
  return `${header}\n${entries.map(([key, value]) => `${key}=${value}`).join('\n')}\n`;
}

/**
 * @throws SecretsError naming each missing or malformed variable
 */
export function buildEnvFiles(input: BuildEnvInput): BuiltEnv {
  const { secrets } = input;
  const missing = REQUIRED_SECRETS.filter((name) => !secrets[name]);
  if (missing.length > 0) {
    throw new SecretsError(`The secrets file does not define: ${missing.join(', ')}`);
  }
  if (secrets['SUPABASE_ANON_KEY'] === secrets['SUPABASE_SERVICE_ROLE_KEY']) {
    // The web file must never receive the service role key, even by a mix-up in the secrets file.
    throw new SecretsError('SUPABASE_ANON_KEY must not be the same value as the service role key');
  }
  const ref = secrets['SUPABASE_PROJECT_REF'] as string;
  const url = secrets['SUPABASE_URL'] as string;
  if (!URL.canParse(url) || new URL(url).origin !== `https://${ref}.supabase.co`) {
    throw new SecretsError('SUPABASE_URL must be https://<SUPABASE_PROJECT_REF>.supabase.co');
  }
  const apiPort = input.apiPort || DEFAULT_API_PORT;
  const webPort = input.webPort || DEFAULT_WEB_PORT;
  if (!isPort(apiPort) || !isPort(webPort)) {
    throw new SecretsError('API_PORT and WEB_PORT must be port numbers');
  }
  const poolerHost = secrets['SUPABASE_POOLER_HOST'] || DEFAULT_POOLER_HOST;
  if (!/^[a-z0-9.-]+$/i.test(poolerHost)) {
    throw new SecretsError('SUPABASE_POOLER_HOST must be a host name');
  }
  const dbPassword = secrets['SUPABASE_DB_PASSWORD'] as string;
  const appUserPassword = derivePassword(dbPassword, 'app_user');
  const smokePassword = derivePassword(secrets['SUPABASE_SERVICE_ROLE_KEY'] as string, 'dev-owner');
  const ownerPassword = encodeURIComponent(dbPassword);

  const apiEntries: (readonly [string, string])[] = [
    ['NODE_ENV', 'development'],
    ['API_PORT', apiPort],
    ['LOG_LEVEL', 'info'],
    // The API connects as app_user through the transaction pooler (port 6543).
    [
      'DATABASE_URL',
      `postgresql://app_user.${ref}:${encodeURIComponent(appUserPassword)}@${poolerHost}:6543/postgres`,
    ],
    // Migrations and provisioning use the owner role through the session pooler (port 5432).
    [
      'MIGRATION_DATABASE_URL',
      `postgresql://postgres.${ref}:${ownerPassword}@${poolerHost}:5432/postgres`,
    ],
    ['SUPABASE_URL', url],
    ['SUPABASE_JWT_ISSUER', `${url}/auth/v1`],
    ['SUPABASE_SERVICE_ROLE_KEY', secrets['SUPABASE_SERVICE_ROLE_KEY'] as string],
    ['WEB_ORIGIN', `http://localhost:${webPort}`],
    // Password of the two test owners that `pnpm setup:tenants` creates in the dev project.
    ['SMOKE_OWNER_PASSWORD', smokePassword],
  ];
  const webEntries: (readonly [string, string])[] = [
    ['VITE_API_URL', `http://localhost:${apiPort}`],
    ['VITE_SUPABASE_URL', url],
    ['VITE_SUPABASE_ANON_KEY', secrets['SUPABASE_ANON_KEY'] as string],
    ['WEB_PORT', webPort],
  ];
  return {
    apiEnv: render(
      apiEntries,
      '# Written by `pnpm setup:env`. Gitignored. Contains secrets: never share.',
    ),
    webEnv: render(webEntries, '# Written by `pnpm setup:env`. Gitignored. Public values only.'),
    apiKeys: apiEntries.map(([key]) => key),
    webKeys: webEntries.map(([key]) => key),
  };
}
