import { err, ok } from '@mini-market/shared-kernel';
import type { Result } from '@mini-market/shared-kernel';
import type { Transaction } from '../../../infrastructure/db/database';
import { InvalidCatalogItemError } from '../domain/errors';
import type { CatalogLookup } from './ports/catalog-lookup.port';

/** An expense category must belong to the tenant and still be switched on. */
export async function checkExpenseCategory(
  catalog: CatalogLookup,
  tx: Transaction,
  tenantId: string,
  id: string,
): Promise<Result<void, InvalidCatalogItemError>> {
  return (await catalog.isUsableExpenseCategory(tx, tenantId, id))
    ? ok(undefined)
    : err(
        new InvalidCatalogItemError('Unknown or inactive expense category', {
          field: 'expenseCategoryId',
        }),
      );
}

/** A payment method must belong to the tenant, be switched on and be able to pay out money. */
export async function checkPaymentMethod(
  catalog: CatalogLookup,
  tx: Transaction,
  tenantId: string,
  id: string,
): Promise<Result<void, InvalidCatalogItemError>> {
  return (await catalog.isUsablePaymentMethod(tx, tenantId, id))
    ? ok(undefined)
    : err(
        new InvalidCatalogItemError('Unknown or inactive payment method', {
          field: 'paymentMethodId',
        }),
      );
}
