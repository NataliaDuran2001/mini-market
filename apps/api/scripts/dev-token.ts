// Prints a real Supabase access token of a test owner, for manual `curl` calls:
//   TOKEN=$(pnpm --silent dev:token a)        (a = owner of tenant A, b = owner of tenant B)
// The token is the only thing written to stdout; it is valid for about one hour. Do not paste it
// anywhere that is shared (issue #97).
import fs from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { describeError } from '../src/infrastructure/logger/describe-error';
import { tenantByKey } from './dev-tenants';

async function main(argv: readonly string[]): Promise<number> {
  const key = argv[0];
  if (key !== 'a' && key !== 'b') {
    console.error('Usage: pnpm --silent dev:token <a|b>');
    return 1;
  }
  const webEnvPath = path.resolve(__dirname, '../../web/.env');
  const anonKey = fs.existsSync(webEnvPath)
    ? parseEnv(fs.readFileSync(webEnvPath, 'utf8'))['VITE_SUPABASE_ANON_KEY']
    : undefined;
  const supabaseUrl = process.env['SUPABASE_URL'];
  const password = process.env['SMOKE_OWNER_PASSWORD'];
  if (!anonKey || !supabaseUrl || !password) {
    console.error('Environment incomplete: run `pnpm setup:env` first.');
    return 1;
  }
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: tenantByKey(key).ownerEmail, password }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await response.json().catch(() => ({}))) as { access_token?: unknown };
  if (!response.ok || typeof body.access_token !== 'string') {
    console.error(`Sign-in failed with status ${response.status}: run \`pnpm setup:tenants\`.`);
    return 1;
  }
  console.log(body.access_token);
  return 0;
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`dev:token failed: ${JSON.stringify(describeError(error))}`);
    process.exitCode = 1;
  },
);
