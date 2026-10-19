import { createCatalogItemInputSchemas } from '@mini-market/contracts/catalog';
import { err } from '@mini-market/shared-kernel';
import type {
  Clock,
  ForbiddenError,
  NotFoundError,
  Result,
  ValidationError,
} from '@mini-market/shared-kernel';
import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import { requirePermission } from '../../access';
import type { TenantContext } from '../../access';
import { ModulePolicy } from '../../tenancy';
import type { ModuleDisabledError } from '../../tenancy';
import { WRITE_PERMISSION } from '../domain/catalog-item';
import type { CatalogItem } from '../domain/catalog-item';
import type { DuplicateCatalogItemError } from '../domain/errors';
import { parseCatalogKind, validationError } from './catalog-input';
import type { CatalogRepository } from './ports/catalog.repository';

export const CREATE_CATALOG_ITEM = Symbol('CREATE_CATALOG_ITEM');

export interface CreateCatalogItemDeps {
  readonly catalogs: CatalogRepository;
  readonly clock: Clock;
  readonly withTransaction: WithTransaction;
}

type CreateError =
  | ForbiddenError
  | NotFoundError
  | ValidationError
  | ModuleDisabledError
  | DuplicateCatalogItemError;

export type CreateCatalogItem = (
  ctx: TenantContext,
  kind: string,
  input: unknown,
) => Promise<Result<CatalogItem, CreateError>>;

/** Owner only. `input` is validated against the schema of the kind. */
export async function createCatalogItem(
  deps: CreateCatalogItemDeps,
  ctx: TenantContext,
  kind: string,
  input: unknown,
): Promise<Result<CatalogItem, CreateError>> {
  const allowed = requirePermission(ctx, WRITE_PERMISSION);
  if (!allowed.ok) return allowed;
  const parsedKind = parseCatalogKind(kind);
  if (!parsedKind.ok) return parsedKind;
  const parsed = createCatalogItemInputSchemas[parsedKind.value].safeParse(input);
  if (!parsed.success) return err(validationError('Catalog item is invalid', parsed.error));
  if ('kind' in parsed.data && parsed.data.kind === 'credit') {
    // A credit payment method only makes sense with credit sales on (ADR 0006).
    const enabled = ModulePolicy.require(ctx, 'credit_sales');
    if (!enabled.ok) return enabled;
  }
  return deps.withTransaction(ctx, (tx) =>
    deps.catalogs.create(tx, ctx.tenantId, parsedKind.value, parsed.data, deps.clock.now()),
  );
}
