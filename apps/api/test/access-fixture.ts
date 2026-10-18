import { Writable } from 'node:stream';
import type { INestApplication, Provider, Type } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
} from '../src/modules/access/application/ports/supabase-admin.port';
import { SUPABASE_ADMIN } from '../src/modules/access/application/tokens';
import type { Role } from '../src/modules/access';
import { createTestAuth } from './auth';
import type { TestAuth, TokenOptions } from './auth';
import { createTestApp, testEnv } from './create-test-app';
import { createTestDb } from './harness';
import type { TestDb } from './harness';
import { seedMember, seedTenant } from './helpers/seed';

export const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
export const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
export const OTHER_OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';

export class FakeSupabaseAdmin implements SupabaseAdminPort {
  readonly invites: SupabaseInviteRequest[] = [];
  /** Set to make the next sends fail like an unreachable provider. */
  fail = false;

  inviteUserByEmail(request: SupabaseInviteRequest): Promise<void> {
    this.invites.push(request);
    return this.fail
      ? Promise.reject(new Error('Supabase invite failed with status 500 (unexpected_failure)'))
      : Promise.resolve();
  }
}

export interface AccessApp {
  readonly app: () => INestApplication;
  readonly testDb: () => TestDb;
  readonly auth: () => TestAuth;
  readonly admin: FakeSupabaseAdmin;
  /** The tenant "sol", seeded before each test. */
  readonly tenantId: () => string;
  /** A second tenant "luna", for isolation checks. */
  readonly otherTenantId: () => string;
  readonly logLines: string[];
  /** Adds a member (and the user row) to a tenant. */
  addMember(member: {
    readonly tenantId: string;
    readonly userId: string;
    readonly role: Role;
    readonly status?: 'active' | 'disabled';
  }): Promise<void>;
  bearer(claims?: TokenOptions): Promise<string>;
}

/**
 * Registers the hooks of an integration suite that needs the real guards: PGlite per file, two
 * seeded tenants, a fresh app per test (the JWT guard remembers which users it mirrored and
 * `truncateAll` removes the rows), a local key pair and a fake Supabase admin.
 */
export function useAccessApp(
  options: { readonly providers?: Provider[]; readonly controllers?: Type[] } = {},
): AccessApp {
  let testDb: TestDb;
  let app: INestApplication;
  let auth: TestAuth;
  let tenantId = '';
  let otherTenantId = '';
  const admin = new FakeSupabaseAdmin();
  const logLines: string[] = [];

  beforeAll(async () => {
    testDb = await createTestDb();
    auth = await createTestAuth();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    admin.invites.length = 0;
    admin.fail = false;
    logLines.length = 0;
    tenantId = await seedTenant(testDb, { slug: 'sol' });
    otherTenantId = await seedTenant(testDb, { slug: 'luna' });
    app = await createTestApp({
      database: testDb.db,
      auth,
      env: testEnv({ LOG_LEVEL: 'info' }),
      logStream: new Writable({
        write(chunk: Buffer, _encoding, done) {
          logLines.push(chunk.toString());
          done();
        },
      }),
      ...(options.providers ? { providers: options.providers } : {}),
      ...(options.controllers ? { controllers: options.controllers } : {}),
      overrides: [{ token: SUPABASE_ADMIN, useValue: admin }],
    });
  });

  afterEach(async () => {
    await app.close();
  });

  return {
    app: () => app,
    testDb: () => testDb,
    auth: () => auth,
    admin,
    tenantId: () => tenantId,
    otherTenantId: () => otherTenantId,
    logLines,
    addMember: (member) =>
      seedMember(testDb, {
        ...member,
        email: `${member.role}-${member.userId.slice(-4)}@example.com`,
      }),
    bearer: async (claims) => `Bearer ${await auth.signToken(claims)}`,
  };
}
