// Creates the two test tenants of the local run in the Supabase dev project (issue #97):
//   pnpm setup:tenants
// For each tenant in `dev-tenants.ts`: creates the owner's Supabase Auth account (confirmed, with
// the password of SMOKE_OWNER_PASSWORD, so no email is sent), then runs the provisioning script of
// issue #13 (`pnpm provision`), which creates the tenant with its preset, the owner membership and
// the catalog seeds. Idempotent: a second run creates nothing new and sets the password again.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describeError } from '../src/infrastructure/logger/describe-error';
import { DEV_TENANTS } from './dev-tenants';
import { AuthAdmin } from './local-auth-admin';

const API_ROOT = path.resolve(__dirname, '..');

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set: run \`pnpm setup:env\` first`);
  return value;
};

async function main(): Promise<number> {
  const auth = new AuthAdmin({
    supabaseUrl: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  });
  const password = requireEnv('SMOKE_OWNER_PASSWORD');
  requireEnv('MIGRATION_DATABASE_URL');
  requireEnv('WEB_ORIGIN');

  for (const tenant of DEV_TENANTS) {
    const { created } = await auth.ensureUserWithPassword(tenant.ownerEmail, password);
    console.log(
      `Auth user ${tenant.ownerEmail}: ${created ? 'created' : 'already existed, password set again'}`,
    );
    const result = spawnSync(
      process.execPath,
      [
        '-r',
        '@swc-node/register',
        path.join(API_ROOT, 'scripts', 'provision-tenant.ts'),
        '--name',
        tenant.name,
        '--slug',
        tenant.slug,
        '--preset',
        tenant.preset,
        '--owner-email',
        tenant.ownerEmail,
      ],
      { cwd: API_ROOT, stdio: 'inherit', env: process.env },
    );
    if (result.status !== 0) {
      console.error(`Provisioning ${tenant.slug} failed.`);
      return 1;
    }
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(`setup:tenants failed: ${JSON.stringify(describeError(error))}`);
    process.exitCode = 1;
  },
);
