import { ConflictError, err, NotFoundError, ok } from '@mini-market/shared-kernel';
import type { DomainError, Result } from '@mini-market/shared-kernel';
import { eq } from 'drizzle-orm';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type {
  NewTenant,
  StoredTenant,
  TenantRepository,
} from '../application/ports/tenant.repository';
import type { TenantScope } from '../application/tenant-scope';
import { tenants } from './schema';

const UNIQUE_VIOLATION = '23505';

/** Driver errors carry the SQLSTATE in `code`; Drizzle wraps them, so look at the causes too. */
function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current instanceof Error; depth++) {
    if ('code' in current && current.code === UNIQUE_VIOLATION) return true;
    current = current.cause;
  }
  return false;
}

export function createTenantRepository(withTransaction: WithTransaction): TenantRepository {
  return {
    async create(tenant: NewTenant): Promise<Result<StoredTenant, ConflictError>> {
      try {
        const [row] = await withTransaction(null, (tx) =>
          tx
            .insert(tenants)
            .values({
              slug: tenant.slug,
              name: tenant.name,
              settings: tenant.settings,
              createdAt: tenant.createdAt,
              updatedAt: tenant.createdAt,
            })
            .returning(),
        );
        if (!row) throw new Error('insert into tenants returned no row');
        return ok(row);
      } catch (error) {
        if (isUniqueViolation(error)) {
          return err(new ConflictError('Slug already in use', { slug: tenant.slug }));
        }
        throw error;
      }
    },

    async findById(ctx: TenantScope): Promise<StoredTenant | null> {
      const [row] = await withTransaction(ctx, (tx) =>
        tx.select().from(tenants).where(eq(tenants.id, ctx.tenantId)).limit(1),
      );
      return row ?? null;
    },

    updateSettings<E extends DomainError>(
      ctx: TenantScope,
      change: (current: StoredTenant) => Result<NewTenant['settings'], E>,
      now: Date,
    ): Promise<Result<StoredTenant, E | NotFoundError>> {
      return withTransaction(ctx, async (tx) => {
        const [current] = await tx
          .select()
          .from(tenants)
          .where(eq(tenants.id, ctx.tenantId))
          .limit(1)
          .for('update');
        if (!current) {
          return err(new NotFoundError('Tenant not found', { tenantId: ctx.tenantId }));
        }
        const next = change(current);
        if (!next.ok) return next;
        const [row] = await tx
          .update(tenants)
          .set({ settings: next.value, updatedAt: now })
          .where(eq(tenants.id, ctx.tenantId))
          .returning();
        if (!row) throw new Error('update of tenants returned no row');
        return ok(row);
      });
    },
  };
}
