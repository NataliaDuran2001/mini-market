import { FixedClock, ForbiddenError, unwrapOrThrow } from '@mini-market/shared-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inviteMember } from '../../src/modules/access/application/invite-member';
import type { InviteMemberDeps } from '../../src/modules/access/application/invite-member';
import type { InvitationTokenPort } from '../../src/modules/access/application/ports/invitation-token.port';
import type { MembershipDirectory } from '../../src/modules/access/application/ports/membership-directory.port';
import type {
  SupabaseAdminPort,
  SupabaseInviteRequest,
} from '../../src/modules/access/application/ports/supabase-admin.port';
import { InviteDeliveryFailedError, NotAMemberError } from '../../src/modules/access/domain/errors';
import type { Role } from '../../src/modules/access/domain/identity';
import { DrizzleInvitationRepository } from '../../src/modules/access/infrastructure/drizzle-invitation.repository';
import { DrizzleUserRepository } from '../../src/modules/access/infrastructure/drizzle-user.repository';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

const TENANT_A = '00000000-0000-0000-0000-0000000000a1';
const TENANT_B = '00000000-0000-0000-0000-0000000000b2';
const OWNER_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OWNER_B = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';
const EMPLOYEE_A = '3f2504e0-4f89-41d3-9a0c-0305e82c3303';

interface InvitationRow {
  id: string;
  tenant_id: string;
  email: string;
  token_hash: string;
  expires_at: Date;
}

describe('inviteMember', () => {
  let testDb: TestDb;
  const roles = new Map<string, Role>();
  const sent: SupabaseInviteRequest[] = [];
  let failSend = false;
  const failures: unknown[] = [];
  let counter = 0;

  const supabaseAdmin: SupabaseAdminPort = {
    inviteUserByEmail(request) {
      sent.push(request);
      return failSend
        ? Promise.reject(new Error('Supabase invite failed with status 500'))
        : Promise.resolve();
    },
  };
  const tokens: InvitationTokenPort = {
    generate: () => {
      counter += 1;
      return { token: `token-${counter}`, tokenHash: `hash-${counter}` };
    },
  };
  const memberships: MembershipDirectory = {
    roleOf: (_tx, tenantId, userId) => Promise.resolve(roles.get(`${tenantId}:${userId}`) ?? null),
  };
  let deps: InviteMemberDeps;

  const rows = async () =>
    (
      await testDb.client.query<InvitationRow>(
        'select * from invitations order by tenant_id, email',
      )
    ).rows;

  beforeAll(async () => {
    testDb = await createTestDb();
    deps = {
      clock: new FixedClock('2026-10-15T14:00:00Z'),
      invitations: new DrizzleInvitationRepository(),
      memberships,
      supabaseAdmin,
      tokens,
      withTransaction: testDb.withTransaction,
      reportFailure: (error) => void failures.push(error),
      acceptInvitationUrl: 'https://app.example/accept-invitation',
    };
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    const users = new DrizzleUserRepository();
    await testDb.withTransaction(null, async (tx) => {
      for (const [userId, email] of [
        [OWNER_A, 'owner.a@example.com'],
        [OWNER_B, 'owner.b@example.com'],
        [EMPLOYEE_A, 'employee.a@example.com'],
      ] as const) {
        await users.upsert(tx, { userId, email });
      }
    });
    roles.clear();
    roles.set(`${TENANT_A}:${OWNER_A}`, 'owner');
    roles.set(`${TENANT_A}:${EMPLOYEE_A}`, 'employee');
    roles.set(`${TENANT_B}:${OWNER_B}`, 'owner');
    sent.length = 0;
    failSend = false;
    failures.length = 0;
    counter = 0;
  });

  it('stores a pending invitation that expires in seven days and sends the invite link', async () => {
    // AC-4
    const receipt = unwrapOrThrow(
      await inviteMember(
        deps,
        { tenantId: TENANT_A, userId: OWNER_A },
        { email: 'Ana@Example.com', role: 'employee' },
      ),
    );

    expect(receipt).toMatchObject({
      email: 'ana@example.com',
      role: 'employee',
    });
    expect(receipt.expiresAt.toISOString()).toBe('2026-10-22T14:00:00.000Z');
    expect(sent).toEqual([
      {
        email: 'ana@example.com',
        redirectTo: 'https://app.example/accept-invitation?token=token-1',
      },
    ]);
    const [row] = await rows();
    expect(row).toMatchObject({
      tenant_id: TENANT_A,
      email: 'ana@example.com',
      token_hash: 'hash-1',
    });
  });

  it('refuses an employee with FORBIDDEN and stores and sends nothing', async () => {
    // AC-5
    const result = await inviteMember(
      deps,
      { tenantId: TENANT_A, userId: EMPLOYEE_A },
      { email: 'x@example.com', role: 'employee' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ForbiddenError);
      expect(result.error.details).toEqual({ permission: 'members.manage' });
    }
    expect(sent).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it('refuses a user who is not a member of the tenant, even an owner elsewhere', async () => {
    // AC-5 (docs/05-security.md: membership checked per request)
    const result = await inviteMember(
      deps,
      { tenantId: TENANT_A, userId: OWNER_B },
      { email: 'x@example.com', role: 'employee' },
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBeInstanceOf(NotAMemberError);
    expect(await rows()).toEqual([]);
  });

  it('replaces the pending invitation of the same email when the owner resends', async () => {
    const first = unwrapOrThrow(
      await inviteMember(
        deps,
        { tenantId: TENANT_A, userId: OWNER_A },
        { email: 'ana@example.com', role: 'employee' },
      ),
    );
    const second = unwrapOrThrow(
      await inviteMember(
        deps,
        { tenantId: TENANT_A, userId: OWNER_A },
        { email: 'ANA@example.com', role: 'employee' },
      ),
    );

    expect(second.invitationId).toBe(first.invitationId);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]?.token_hash).toBe('hash-2'); // the first link no longer works
  });

  it('keeps invitations of different tenants apart, even for the same email', async () => {
    // docs/05-security.md: tenant isolation test for the repository
    await inviteMember(
      deps,
      { tenantId: TENANT_A, userId: OWNER_A },
      { email: 'shared@example.com', role: 'employee' },
    );
    await inviteMember(
      deps,
      { tenantId: TENANT_B, userId: OWNER_B },
      { email: 'shared@example.com', role: 'employee' },
    );

    const all = await rows();
    expect(all.map((row) => [row.tenant_id, row.token_hash])).toEqual([
      [TENANT_A, 'hash-1'],
      [TENANT_B, 'hash-2'],
    ]);
  });

  it('does not touch another tenant row when a pending invitation is replaced', async () => {
    // docs/05-security.md: tenant isolation of writes; the upsert key includes the tenant
    const forB = unwrapOrThrow(
      await inviteMember(
        deps,
        { tenantId: TENANT_B, userId: OWNER_B },
        { email: 'shared@example.com', role: 'employee' },
      ),
    );
    await inviteMember(
      deps,
      { tenantId: TENANT_A, userId: OWNER_A },
      { email: 'shared@example.com', role: 'employee' },
    );
    await inviteMember(
      deps,
      { tenantId: TENANT_A, userId: OWNER_A },
      { email: 'shared@example.com', role: 'employee' },
    );

    const all = await rows();
    const rowForB = all.find((row) => row.tenant_id === TENANT_B);
    expect(rowForB).toMatchObject({ id: forB.invitationId, token_hash: 'hash-1' });
    expect(all.filter((row) => row.tenant_id === TENANT_A)).toHaveLength(1);
  });

  it('answers a failed send with INVITE_DELIVERY_FAILED, keeps the invitation and reports the cause', async () => {
    failSend = true;
    const failed = await inviteMember(
      deps,
      { tenantId: TENANT_A, userId: OWNER_A },
      { email: 'x@example.com', role: 'employee' },
    );

    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toBeInstanceOf(InviteDeliveryFailedError);
    expect(failures).toHaveLength(1);
    expect(await rows()).toHaveLength(1); // the owner can send it again

    failSend = false;
    unwrapOrThrow(
      await inviteMember(
        deps,
        { tenantId: TENANT_A, userId: OWNER_A },
        { email: 'x@example.com', role: 'employee' },
      ),
    );
    expect(await rows()).toHaveLength(1);
  });

  it('rejects an email that is not stored in lower case', async () => {
    // migration: invitations_email_lowercase_check
    await expect(
      testDb.client.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         values ($1, 'Mixed@Example.com', 'employee', 'h', $2, now())`,
        [TENANT_A, OWNER_A],
      ),
    ).rejects.toThrow(/invitations_email_lowercase_check/);
  });

  it('rejects an invitation row with a role other than owner or employee', async () => {
    // migration: invitations_role_check
    await expect(
      testDb.client.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         values ($1, 'x@example.com', 'admin', 'h', $2, now())`,
        [TENANT_A, OWNER_A],
      ),
    ).rejects.toThrow(/invitations_role_check/);
  });
});
