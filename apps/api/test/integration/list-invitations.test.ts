import { FixedClock, ForbiddenError } from '@mini-market/shared-kernel';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { listInvitations } from '../../src/modules/access/application/list-invitations';
import { DrizzleInvitationRepository } from '../../src/modules/access/infrastructure/drizzle-invitation.repository';
import { EMPLOYEE_ID, OTHER_OWNER_ID, OWNER_ID, useAccessApp } from '../access-fixture';
import { asEmployee, asOwner } from '../helpers/contexts';
import { expectTenantIsolation } from '../isolation';

const DAY = 86_400_000;

interface SeedInvitation {
  readonly tenantId: string;
  readonly email: string;
  readonly createdAt: Date;
  readonly expiresAt: Date;
  readonly role?: string;
  readonly consumedAt?: Date | null;
}

describe('GET /api/v1/invitations', () => {
  const ctx = useAccessApp();
  const repository = new DrizzleInvitationRepository();
  const server = () => ctx.app().getHttpServer() as Parameters<typeof request>[0];
  const list = async (userId: string, tenant = ctx.tenantId()) =>
    request(server())
      .get('/api/v1/invitations')
      .set('Authorization', await ctx.bearer({ sub: userId }))
      .set('X-Tenant-Id', tenant);
  const seedTeam = async () => {
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: OWNER_ID, role: 'owner' });
    await ctx.addMember({ tenantId: ctx.tenantId(), userId: EMPLOYEE_ID, role: 'employee' });
    await ctx.addMember({ tenantId: ctx.otherTenantId(), userId: OTHER_OWNER_ID, role: 'owner' });
  };
  // Direct insert: tests control creation and expiry times, and the token hash is a fake value
  // that must never come back.
  const seedInvitation = async (invitation: SeedInvitation) => {
    await ctx
      .testDb()
      .client.query(
        `insert into invitations (tenant_id, email, role, token_hash, invited_by, expires_at, created_at, consumed_at)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          invitation.tenantId,
          invitation.email,
          invitation.role ?? 'employee',
          `hash-of-${invitation.tenantId}-${invitation.email}`,
          OWNER_ID,
          invitation.expiresAt,
          invitation.createdAt,
          invitation.consumedAt ?? null,
        ],
      );
  };
  const ago = (days: number) => new Date(Date.now() - days * DAY);
  const ahead = (days: number) => new Date(Date.now() + days * DAY);

  it('lists two pending invitations with email, role, dates and status, newest first', async () => {
    // AC-1
    await seedTeam();
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'old@example.com',
      createdAt: ago(2),
      expiresAt: ahead(5),
    });
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'new@example.com',
      createdAt: ago(1),
      expiresAt: ahead(6),
    });

    const response = await list(OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body.items).toEqual([
      {
        id: expect.any(String),
        email: 'new@example.com',
        role: 'employee',
        invitedAt: expect.any(String),
        expiresAt: expect.any(String),
        status: 'pending',
      },
      expect.objectContaining({ email: 'old@example.com', status: 'pending' }),
    ]);
    const [newest] = response.body.items;
    expect(new Date(newest.invitedAt).getTime()).toBeLessThan(Date.now());
    expect(new Date(newest.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('marks an invitation past its expiry as expired and leaves out an accepted one', async () => {
    await seedTeam();
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'late@example.com',
      createdAt: ago(10),
      expiresAt: ago(3),
    });
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'done@example.com',
      createdAt: ago(9),
      expiresAt: ahead(1),
      consumedAt: ago(8),
    });

    const response = await list(OWNER_ID);

    expect(response.status).toBe(200);
    expect(response.body.items).toHaveLength(1);
    expect(response.body.items[0]).toMatchObject({ email: 'late@example.com', status: 'expired' });
  });

  it('is empty when nothing was sent', async () => {
    await seedTeam();
    const response = await list(OWNER_ID);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it('never returns a token, a hash or any field outside the contract', async () => {
    // AC-2
    await seedTeam();
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'ana@example.com',
      createdAt: ago(1),
      expiresAt: ahead(6),
    });

    const response = await list(OWNER_ID);

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.items[0]).sort()).toEqual(
      ['email', 'expiresAt', 'id', 'invitedAt', 'role', 'status'].sort(),
    );
    const raw = JSON.stringify(response.body);
    expect(raw).not.toMatch(/hash/i);
    expect(raw).not.toMatch(/token/i);
    expect(raw).not.toContain('hash-of-');
    expect(raw).not.toContain(ctx.tenantId());
  });

  it('shows what the invite endpoint stored, without the token that went to the email', async () => {
    // AC-2: the same invitation the owner just sent, read back
    await seedTeam();
    const sent = await request(server())
      .post('/api/v1/auth/invitations')
      .set('Authorization', await ctx.bearer({ sub: OWNER_ID }))
      .set('X-Tenant-Id', ctx.tenantId())
      .send({ email: 'Nuevo@Example.com', role: 'employee' });
    expect(sent.status).toBe(202);

    const response = await list(OWNER_ID);

    expect(response.body.items).toEqual([
      expect.objectContaining({ email: 'nuevo@example.com', status: 'pending' }),
    ]);
    const token = new URL(ctx.admin.invites[0]?.redirectTo ?? '').searchParams.get('token');
    expect(token).toMatch(/^[\w-]{43}$/);
    expect(JSON.stringify(response.body)).not.toContain(token as string);
  });

  it('answers 403 FORBIDDEN to an employee and names the permission', async () => {
    // AC-3
    await seedTeam();
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'ana@example.com',
      createdAt: ago(1),
      expiresAt: ahead(6),
    });

    const response = await list(EMPLOYEE_ID);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'FORBIDDEN', permission: 'members.manage' });
    expect(JSON.stringify(response.body)).not.toContain('ana@example.com');
  });

  it('refuses the use case to an employee context before touching the database', async () => {
    // AC-3
    const result = await listInvitations(
      {
        invitations: repository,
        clock: new FixedClock('2026-10-15T14:00:00Z'),
        withTransaction: ctx.testDb().withTransaction,
      },
      asEmployee(ctx.tenantId()),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBeInstanceOf(ForbiddenError);
      expect(result.error.details).toEqual({ permission: 'members.manage' });
    }
  });

  it('shows owner A nothing of tenant B, over HTTP', async () => {
    // AC-4
    await seedTeam();
    await seedInvitation({
      tenantId: ctx.tenantId(),
      email: 'mine@example.com',
      createdAt: ago(1),
      expiresAt: ahead(6),
    });
    await seedInvitation({
      tenantId: ctx.otherTenantId(),
      email: 'theirs@example.com',
      createdAt: ago(1),
      expiresAt: ahead(6),
    });

    const response = await list(OWNER_ID);
    expect(response.body.items.map((item: { email: string }) => item.email)).toEqual([
      'mine@example.com',
    ]);

    // owner A naming tenant B in the header is not a member there
    const crossTenant = await list(OWNER_ID, ctx.otherTenantId());
    expect(crossTenant.status).toBe(403);
    expect(JSON.stringify(crossTenant.body)).not.toContain('theirs@example.com');
  });

  it('never crosses tenants through the repository method (isolation helper)', async () => {
    // AC-4
    const tenantA = ctx.tenantId();
    const tenantB = ctx.otherTenantId();
    await seedTeam();
    const testDb = ctx.testDb();

    // invitations has no RLS (ADR 0001 exception), so the "no scope, no rows" checks of the helper
    // cannot be answered by the database: the repository takes a TenantContext, and without one
    // there is nothing to call. The cross-tenant reads and the wrong-id write are the real proof.
    await expectTenantIsolation({
      tenantA,
      tenantB,
      seed: (tenantId) =>
        seedInvitation({
          tenantId,
          email: `${tenantId.slice(0, 8)}@example.com`,
          createdAt: ago(1),
          expiresAt: ahead(6),
        }),
      list: async (scope) =>
        scope?.tenantId
          ? testDb.withTransaction(scope, (tx) =>
              repository.listOpen(tx, asOwner(scope.tenantId as string)),
            )
          : [],
    });

    const asA = await testDb.withTransaction({ tenantId: tenantA, events: [] }, (tx) =>
      repository.listOpen(tx, asOwner(tenantA)),
    );
    const asB = await testDb.withTransaction({ tenantId: tenantB, events: [] }, (tx) =>
      repository.listOpen(tx, asOwner(tenantB)),
    );
    expect(asA.map((row) => row.email)).toEqual([`${tenantA.slice(0, 8)}@example.com`]);
    expect(asB.map((row) => row.email)).toEqual([`${tenantB.slice(0, 8)}@example.com`]);

    // even a transaction bound to tenant B only returns what the context names
    const crossed = await testDb.withTransaction({ tenantId: tenantB, events: [] }, (tx) =>
      repository.listOpen(tx, asOwner(tenantA)),
    );
    expect(crossed.every((row) => row.tenantId === tenantA)).toBe(true);
    expect(Object.keys(asA[0] ?? {}).sort()).toEqual(
      ['email', 'expiresAt', 'id', 'invitedAt', 'role', 'tenantId'].sort(),
    );
  });
});
