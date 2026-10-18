import { Writable } from 'node:stream';
import type { INestApplication } from '@nestjs/common';
import { afterAll, afterEach, beforeAll, beforeEach } from 'vitest';
import type { MembershipDirectory } from '../src/modules/access/application/ports/membership-directory.port';
import type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
} from '../src/modules/access/application/ports/supabase-admin.port';
import { MEMBERSHIP_DIRECTORY, SUPABASE_ADMIN } from '../src/modules/access/application/tokens';
import type { Role } from '../src/modules/access/domain/identity';
import { createTestAuth } from './auth';
import type { TestAuth, TokenOptions } from './auth';
import { createTestApp, testEnv } from './create-test-app';
import { createTestDb } from './harness';
import type { TestDb } from './harness';

export const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
export const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
export const TENANT_ID = '00000000-0000-0000-0000-0000000000a1';

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
  /** `${tenantId}:${userId}` to role; what the fake membership directory answers. */
  readonly roles: Map<string, Role>;
  readonly logLines: string[];
  bearer(claims?: TokenOptions): Promise<string>;
}

/**
 * Registers the hooks of an integration suite that needs the real guard: PGlite per file, a fresh
 * app per test (the guard remembers which users it mirrored and `truncateAll` removes the rows),
 * a local key pair, a fake Supabase admin and a fake membership directory.
 */
export function useAccessApp(): AccessApp {
  let testDb: TestDb;
  let app: INestApplication;
  let auth: TestAuth;
  const admin = new FakeSupabaseAdmin();
  const roles = new Map<string, Role>();
  const logLines: string[] = [];
  const memberships: MembershipDirectory = {
    roleOf: (_tx, tenantId, userId) => Promise.resolve(roles.get(`${tenantId}:${userId}`) ?? null),
  };

  beforeAll(async () => {
    testDb = await createTestDb();
    auth = await createTestAuth();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    roles.clear();
    admin.invites.length = 0;
    admin.fail = false;
    logLines.length = 0;
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
      overrides: [
        { token: SUPABASE_ADMIN, useValue: admin },
        { token: MEMBERSHIP_DIRECTORY, useValue: memberships },
      ],
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
    roles,
    logLines,
    bearer: async (claims) => `Bearer ${await auth.signToken(claims)}`,
  };
}
