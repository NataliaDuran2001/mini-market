// S3: weighted average cost, recalculated on every purchase. Integer arithmetic, rounded once.
import { Money } from './money.js';
import type { Quantity } from './quantity.js';
import { divideRounded } from './rounding.js';

export const WeightedAverage = {
  /**
   * new_avg = (prevQty * prevAvgCost + inQty * inUnitCost) / (prevQty + inQty), HALF_UP to the
   * centavo. When prevQty is zero or negative the purchase cost becomes the average (S3).
   * `inQty` must be positive: a purchase of nothing is a caller bug, not a business outcome.
   */
  next(prevQty: Quantity, prevAvgCost: Money, inQty: Quantity, inUnitCost: Money): Money {
    if (!inQty.isPositive()) throw new RangeError('Purchased quantity must be positive');
    if (!prevQty.isPositive()) return inUnitCost;
    // Thousandths cancel between numerator and denominator, leaving centavos per unit.
    const numerator =
      prevQty.toThousandths() * prevAvgCost.toCentavos() +
      inQty.toThousandths() * inUnitCost.toCentavos();
    const denominator = prevQty.toThousandths() + inQty.toThousandths();
    return Money.fromCentavos(divideRounded(numerator, denominator));
  },
} as const;
