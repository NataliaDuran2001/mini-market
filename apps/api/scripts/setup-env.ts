// Writes the gitignored `apps/api/.env` and `apps/web/.env` from the operator's secrets file:
//   pnpm setup:env
// The secrets file lives outside the repository (default `~/.mini-market/supabase-dev.env`, or the
// path in MINI_MARKET_SECRETS_FILE). The web file gets only public values. Nothing it reads is
// ever printed: the report lists variable names and file paths only (issue #97).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { buildEnvFiles, SecretsError } from './local-env';

export const DEFAULT_SECRETS_FILE = '~/.mini-market/supabase-dev.env';

export interface SetupEnvOptions {
  /** Value of MINI_MARKET_SECRETS_FILE, when set. */
  readonly secretsFile?: string | undefined;
  readonly apiEnvPath: string;
  readonly webEnvPath: string;
  readonly apiPort?: string | undefined;
  readonly webPort?: string | undefined;
  readonly homeDir?: string | undefined;
  readonly log: (line: string) => void;
  readonly logError: (line: string) => void;
}

export function expandHome(file: string, homeDir: string): string {
  return file === '~' || file.startsWith('~/') || file.startsWith('~\\')
    ? path.join(homeDir, file.slice(1))
    : file;
}

function readEnvFile(file: string): Record<string, string | undefined> | undefined {
  try {
    return parseEnv(fs.readFileSync(file, 'utf8')) as Record<string, string | undefined>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** @returns the process exit code */
export function runSetupEnv(options: SetupEnvOptions): number {
  const shown = options.secretsFile || DEFAULT_SECRETS_FILE;
  const secretsPath = expandHome(shown, options.homeDir ?? os.homedir());
  const secrets = readEnvFile(secretsPath);
  if (!secrets) {
    options.logError(`Secrets file not found: ${shown}`);
    options.logError(
      'Create it with the Supabase dev project values (docs/07-local-development.md section 2) or set MINI_MARKET_SECRETS_FILE.',
    );
    return 1;
  }
  let built;
  try {
    built = buildEnvFiles({
      secrets,
      apiPort: options.apiPort,
      webPort: options.webPort,
    });
  } catch (error) {
    if (error instanceof SecretsError) {
      options.logError(`${error.message} (secrets file: ${shown})`);
      return 1;
    }
    throw error;
  }
  fs.mkdirSync(path.dirname(options.apiEnvPath), { recursive: true });
  fs.mkdirSync(path.dirname(options.webEnvPath), { recursive: true });
  // 0o600: the API file holds the service role key and two database passwords.
  fs.writeFileSync(options.apiEnvPath, built.apiEnv, { mode: 0o600 });
  fs.writeFileSync(options.webEnvPath, built.webEnv);
  options.log(`Wrote apps/api/.env (${built.apiKeys.join(', ')})`);
  options.log(`Wrote apps/web/.env (${built.webKeys.join(', ')})`);
  options.log('No value was printed. Both files are gitignored.');
  return 0;
}

if (require.main === module) {
  const apiRoot = path.resolve(__dirname, '..');
  process.exitCode = runSetupEnv({
    secretsFile: process.env['MINI_MARKET_SECRETS_FILE'],
    apiEnvPath: path.join(apiRoot, '.env'),
    webEnvPath: path.resolve(apiRoot, '../web/.env'),
    apiPort: process.env['API_PORT'],
    webPort: process.env['WEB_PORT'],
    log: console.log,
    logError: console.error,
  });
}
