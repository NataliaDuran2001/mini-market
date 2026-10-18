import { FixedClock, ForbiddenError, unwrapOrThrow } from '@mini-market/shared-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { inviteMember } from '../../src/modules/access/application/invite-member';
import type { InviteMemberDeps } from '../../src/modules/access/application/invite-member';
import type { InvitationTokenPort } from '../../src/modules/access/application/ports/invitation-token.port';
import type { SupabaseAdminPort } from '../../src/modules/access/application/ports/supabase-admin.port';
import { InviteDeliveryFailedError } from '../../src/modules/access/domain/errors';
import { DrizzleInvitationRepository } from '../../src/modules/access/infrastructure/drizzle-invitation.repository';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { asEmployee, asOwner } from '../helpers/contexts';
import { seedMember, seedTenant } from '../helpers/seed';

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
  let tenantA: string;
  let tenantB: string;
  const sent: { email: string; redirectTo: string }[] = [];
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
    hash: (token) => `hash-of-${token}`,
  };
  let deps: InviteMemberDeps;

  const rows = async () =>
    (
      await testDb.client.query<InvitationRow>(
        'select * from invitations order by tenant_id, email',
      )
    ).rows;
  const ownerA = () => asOwner(tenantA, { userId: OWNER_A });
  const ownerB = () => asOwner(tenantB, { userId: OWNER_B });
  const ana = { email: 'Ana@Example.com', role: 'employee' } as const;

  beforeAll(async () => {
    testDb = await createTestDb();
    deps = {
      clock: new FixedClock('2026-10-15T14:00:00Z'),
      invitations: new DrizzleInvitationRepository(),
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
    tenantA = await seedTenant(testDb, { slug: 'sol' });
    tenantB = await seedTenant(testDb, { slug: 'luna' });
    await seedMember(testDb, {
      tenantId: tenantA,
      userId: OWNER_A,
      email: 'a@e.com',
      role: 'owner',
    });
    await seedMember(testDb, {
      tenantId: tenantB,
      userId: OWNER_B,
      email: 'b@e.com',
      role: 'owner',
    });
    await seedMember(testDb, {
      tenantId: tenantA,
      userId: EMPLOYEE_A,
      email: 'c@e.com',
      role: 'employee',
    });
    sent.length = 0;
    failSend = false;
    failures.length = 0;
    counter = 0;
  });

  it('stores a pending invitation that expires in seven days and sends the invite link', async () => {
    // AC-4 of #9
    const receipt = unwrapOrThrow(await inviteMember(deps, ownerA(), ana));

    expect(receipt).toMatchObject({ email: 'ana@example.com', role: 'employee' });
    expect(receipt.expiresAt.toISOString()).toBe('2026-10-22T14:00:00.000Z');
    expect(sent).toEqual([
      {
        email: 'ana@example.com',
        redirectTo: 'https://app.example/accept-invitation?token=token-1',
      },
    ]);
    const [row] = await rows();
    expect(row).toMatchObject({
      tenant_id: tenantA,
      email: 'ana@example.com',
      token_hash: 'hash-1',
    });
  });

  it('refuses a context without members.manage with FORBIDDEN and stores and sends nothing', async () => {
    // AC-5 of #9: the use case checks the permission itself, besides @RequirePermission
    const result = await inviteMember(deps, asEmployee(tenantA, { userId: EMPLOYEE_A }), ana);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ForbiddenError);
      expect(result.error.details).toEqual({ permission: 'members.manage' });
    }
    expect(sent).toEqual([]);
    expect(await rows()).toEqual([]);
  });

  it('replaces the pending invitation of the same email when the owner resends', async () => {
    const first = unwrapOrThrow(await inviteMember(deps, ownerA(), ana));
    const second = unwrapOrThrow(
      await inviteMember(deps, ownerA(), { email: 'ANA@example.com', role: 'employee' }),
    );

    expect(second.invitationId).toBe(first.invitationId);
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]?.token_hash).toBe('hash-2'); // the first link no longer works
  });

  it('keeps invitations of different tenants apart, even for the same email', async () => {
    // docs/05-security.md: tenant isolation test for the repository
    await inviteMember(deps, ownerA(), { email: 'shared@example.com', role: 'employee' });
    await inviteMember(deps, ownerB(), { email: 'shared@example.com', role: 'employee' });

    const all = await rows();
    expect(all.map((row) => [row.tenant_id, row.token_hash]).sort()).toEqual(
      [
        [tenantA, 'hash-1'],
        [tenantB, 'hash-2'],
      ].sort(),
    );
  });

  it('does not touch another tenant row when a pending invitation is replaced', async () => {
    // docs/05-security.md: tenant isolation of writes; the upsert key includes the tenant
    const forB = unwrapOrThrow(
      await inviteMember(deps, ownerB(), { email: 'shared@example.com', role: 'employee' }),
    );
    await inviteMember(deps, ownerA(), { email: 'shared@example.com', role: 'employee' });
    await inviteMember(deps, ownerA(), { email: 'shared@example.com', role: 'employee' });

    const all = await rows();
    expect(all.find((row) => row.tenant_id === tenantB)).toMatchObject({
      id: forB.invitationId,
      token_hash: 'hash-1',
    });
    expect(all.filter((row) => row.tenant_id === tenantA)).toHaveLength(1);
  });

  it('answers a failed send with INVITE_DELIVERY_FAILED, keeps the invitation and reports the cause', async () => {
    failSend = true;
    const failed = await inviteMember(deps, ownerA(), { email: 'x@example.com', role: 'employee' });

    expect(failed.ok).toBe(false);
    if (!failed.ok) expect(failed.error).toBeInstanceOf(InviteDeliveryFailedError);
    expect(failures).toHaveLength(1);
    expect(await rows()).toHaveLength(1); // the owner can send it again

    failSend = false;
    unwrapOrThrow(await inviteMember(deps, ownerA(), { email: 'x@example.com', role: 'employee' }));
    expect(await rows()).toHaveLength(1);
  });

  it('rejects an email that is not stored in lower case', async () => {
    // migration: invitations_email_lowercase_check
    await expect(
      testDb.client.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         values ($1, 'Mixed@Example.com', 'employee', 'h', $2, now())`,
        [tenantA, OWNER_A],
      ),
    ).rejects.toThrow(/invitations_email_lowercase_check/);
  });

  it('rejects an invitation row with a role other than owner or employee', async () => {
    // migration: invitations_role_check
    await expect(
      testDb.client.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         values ($1, 'x@example.com', 'admin', 'h', $2, now())`,
        [tenantA, OWNER_A],
      ),
    ).rejects.toThrow(/invitations_role_check/);
  });

  it('rejects an invitation for a tenant that does not exist', async () => {
    // migration: invitations_tenant_id_tenants_id_fk
    await expect(
      testDb.client.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, expires_at)
         values ('00000000-0000-0000-0000-00000000dead', 'x@example.com', 'employee', 'h', $1, now())`,
        [OWNER_A],
      ),
    ).rejects.toThrow(/invitations_tenant_id_tenants_id_fk/);
  });
});
