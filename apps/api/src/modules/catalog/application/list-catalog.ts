import { ok } from '@mini-market/shared-kernel';
import type { ForbiddenError, NotFoundError, Result } from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { ModulePolicy } from '../../tenancy';
import { readPermissionFor } from '../domain/catalog-item';
import type { CatalogItem, PaymentMethodKind } from '../domain/catalog-item';
import { parseCatalogKind } from './catalog-input';
import type { CatalogRepository } from './ports/catalog.repository';

export const LIST_CATALOG = Symbol('LIST_CATALOG');

export interface ListCatalogDeps {
  readonly catalogs: CatalogRepository;
  readonly withTransaction: WithTransaction;
}

export interface ListCatalogOptions {
  readonly activeOnly?: boolean;
}

type ListError = NotFoundError | ForbiddenError;

export type ListCatalog = (
  ctx: TenantContext,
  kind: string,
  options?: ListCatalogOptions,
) => Promise<Result<readonly CatalogItem[], ListError>>;

/**
 * Lists one catalog of the caller's tenant. Employees read the catalogs the sale screen needs;
 * expense categories are owner only. The `credit` payment method exists only while the
 * `credit_sales` module is on (ADR 0006).
 */
export async function listCatalog(
  deps: ListCatalogDeps,
  ctx: TenantContext,
  kind: string,
  options: ListCatalogOptions = {},
): Promise<Result<readonly CatalogItem[], ListError>> {
  const parsed = parseCatalogKind(kind);
  if (!parsed.ok) return parsed;
  const allowed = requirePermission(ctx, readPermissionFor(parsed.value));
  if (!allowed.ok) return allowed;
  const excludePaymentKinds: readonly PaymentMethodKind[] = ModulePolicy.isEnabled(
    ctx,
    'credit_sales',
  )
    ? []
    : ['credit'];
  const items = await deps.withTransaction(ctx, (tx) =>
    deps.catalogs.list(tx, ctx.tenantId, parsed.value, {
      activeOnly: options.activeOnly ?? false,
      excludePaymentKinds,
    }),
  );
  return ok(items);
}
