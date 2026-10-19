// Stock movements (ADR 0005, docs/01-domain.md section 3). Pure TypeScript.
import { err, ok, ValidationError } from '@mini-market/shared-kernel';
import type { Money, Quantity, Result } from '@mini-market/shared-kernel';

export const MOVEMENT_KINDS = [
  'initial',
  'purchase',
  'sale',
  'adjustment',
  'void',
  'expired',
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

/** A change of stock a use case asks the ledger to record. `quantity` is signed, in base units. */
export interface NewMovement {
  readonly productId: string;
  readonly kind: MovementKind;
  readonly quantity: Quantity;
  /** Cost per base unit of the units that moved; null when the movement has no cost basis. */
  readonly unitCost: Money | null;
  readonly referenceType?: string | null | undefined;
  readonly referenceId?: string | null | undefined;
  readonly reason?: string | null | undefined;
}

export interface StockMovement {
  readonly id: string;
  readonly productId: string;
  readonly kind: MovementKind;
  readonly quantity: Quantity;
  readonly unitCost: Money | null;
  readonly referenceType: string | null;
  readonly referenceId: string | null;
  readonly reason: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface StockLevel {
  readonly productId: string;
  readonly quantity: Quantity;
  readonly updatedAt: Date;
}

/** Sign each kind must have: stock goes up with these, down with those; an adjustment either way. */
const SIGN_OF_KIND: { readonly [K in MovementKind]: 'in' | 'out' | 'either' } = {
  initial: 'in',
  purchase: 'in',
  void: 'in', // S12: voiding a sale puts the goods back
  sale: 'out',
  expired: 'out',
  adjustment: 'either',
};

/** A movement is never empty, goes the way its kind says, and an adjustment explains itself. */
export function validateMovement(movement: NewMovement): Result<NewMovement, ValidationError> {
  const { quantity, kind } = movement;
  if (quantity.toThousandths() === 0n) {
    return err(new ValidationError('A movement cannot be zero', { productId: movement.productId }));
  }
  const direction = SIGN_OF_KIND[kind];
  if (
    (direction === 'in' && quantity.isNegative()) ||
    (direction === 'out' && quantity.isPositive())
  ) {
    return err(
      new ValidationError(
        `A ${kind} movement must ${direction === 'in' ? 'add' : 'remove'} stock`,
        {
          productId: movement.productId,
          kind,
        },
      ),
    );
  }
  if (kind === 'adjustment' && !movement.reason?.trim()) {
    return err(
      new ValidationError('An adjustment needs a reason', { productId: movement.productId }),
    );
  }
  if (movement.unitCost?.isNegative()) {
    return err(
      new ValidationError('A unit cost cannot be negative', { productId: movement.productId }),
    );
  }
  return ok(movement);
}
