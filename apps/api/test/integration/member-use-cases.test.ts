import { FixedClock, ForbiddenError } from '@mini-market/shared-kernel';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { changeMemberRole } from '../../src/modules/access/application/change-member-role';
import { disableMember } from '../../src/modules/access/application/disable-member';
import { listMembers } from '../../src/modules/access/application/list-members';
import type { AuditPort } from '../../src/modules/access/application/ports/audit.port';
import { DrizzleAuditRepository } from '../../src/modules/access/infrastructure/drizzle-audit.repository';
import { DrizzleMembershipRepository } from '../../src/modules/access/infrastructure/drizzle-membership.repository';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';
import { asEmployee, asOwner } from '../helpers/contexts';
import { seedMember, seedTenant } from '../helpers/seed';

const OWNER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const EMPLOYEE_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3302';

describe('member use cases', () => {
  let testDb: TestDb;
  let tenantId: string;
  let otherTenantId: string;
  const memberships = new DrizzleMembershipRepository();
  const clock = new FixedClock('2026-10-15T14:00:00Z');
  const audit = new DrizzleAuditRepository();
  const failingAudit: AuditPort = {
    record: () => Promise.reject(new Error('audit store is down')),
  };
  const deps = (port: AuditPort = audit) => ({
    memberships,
    audit: port,
    clock,
    withTransaction: testDb.withTransaction,
  });
  const roleOf = async (userId: string) =>
    (
      await testDb.client.query<{ role: string; status: string }>(
        'select role, status from memberships where tenant_id = $1 and user_id = $2',
        [tenantId, userId],
      )
    ).rows[0];

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterAll(async () => {
    await testDb.close();
  });

  beforeEach(async () => {
    await testDb.truncateAll();
    tenantId = await seedTenant(testDb, { slug: 'sol' });
    otherTenantId = await seedTenant(testDb, { slug: 'luna' });
    await seedMember(testDb, { tenantId, userId: OWNER_ID, email: 'o@e.com', role: 'owner' });
    await seedMember(testDb, { tenantId, userId: EMPLOYEE_ID, email: 'e@e.com', role: 'employee' });
  });

  it('refuses a context without members.manage on every member use case, before touching anything', async () => {
    // docs/04-coding-standards.md section 3: the permission is the first line of a use case
    const employee = asEmployee(tenantId, { userId: EMPLOYEE_ID });

    const results = [
      await listMembers(deps(), employee),
      await changeMemberRole(deps(), employee, { userId: EMPLOYEE_ID, role: 'owner' }),
      await disableMember(deps(), employee, { userId: OWNER_ID }),
    ];

    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBeInstanceOf(ForbiddenError);
        expect(result.error.details).toEqual({ permission: 'members.manage' });
      }
    }
    expect(await roleOf(EMPLOYEE_ID)).toEqual({ role: 'employee', status: 'active' });
    expect(await roleOf(OWNER_ID)).toEqual({ role: 'owner', status: 'active' });
  });

  it('rolls the role change back when the audit entry cannot be written', async () => {
    // the audit entry and the change commit together or not at all
    await expect(
      changeMemberRole(deps(failingAudit), asOwner(tenantId, { userId: OWNER_ID }), {
        userId: EMPLOYEE_ID,
        role: 'owner',
      }),
    ).rejects.toThrow('audit store is down');

    expect(await roleOf(EMPLOYEE_ID)).toEqual({ role: 'employee', status: 'active' });
  });

  it('rolls the disabling back when the audit entry cannot be written', async () => {
    await expect(
      disableMember(deps(failingAudit), asOwner(tenantId, { userId: OWNER_ID }), {
        userId: EMPLOYEE_ID,
      }),
    ).rejects.toThrow('audit store is down');

    expect(await roleOf(EMPLOYEE_ID)).toEqual({ role: 'employee', status: 'active' });
  });

  it('writes each audit entry under the tenant of the acting context', async () => {
    await seedMember(testDb, {
      tenantId: otherTenantId,
      userId: EMPLOYEE_ID,
      email: 'e@e.com',
      role: 'employee',
    });

    await changeMemberRole(deps(), asOwner(tenantId, { userId: OWNER_ID }), {
      userId: EMPLOYEE_ID,
      role: 'owner',
    });

    const { rows } = await testDb.client.query<{ tenant_id: string; action: string }>(
      'select tenant_id, action from audit_log',
    );
    expect(rows).toEqual([{ tenant_id: tenantId, action: 'member.role_changed' }]);
    expect(
      (
        await testDb.client.query<{ role: string }>(
          'select role from memberships where tenant_id = $1 and user_id = $2',
          [otherTenantId, EMPLOYEE_ID],
        )
      ).rows[0],
    ).toEqual({ role: 'employee' });
  });
});
