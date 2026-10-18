// Money: integer centavos of BOB held as bigint (ADR 0004). No floating point anywhere.
//
// Deliberately has no toJSON: a Money inside JSON.stringify throws (bigint), so serialization is
// always an explicit mapping in contracts and never an accident.
import { formatScaled, parseScaled, toBigInt } from './decimal.js';
import { ValidationError } from './domain-error.js';
import type { Quantity } from './quantity.js';
import { err, ok, type Result } from './result.js';
import { divideRounded, type RoundingMode } from './rounding.js';

const SCALE = 2;

export class Money {
  readonly currency = 'BOB';
  private readonly centavos: bigint;

  private constructor(centavos: bigint) {
    this.centavos = centavos;
    Object.freeze(this);
  }

  static fromCentavos(value: number | bigint): Money {
    return new Money(toBigInt(value, 'Centavos'));
  }

  static zero(): Money {
    return new Money(0n);
  }

  /** Parses "12.50" (at most 2 decimals). Returns a Validation error otherwise ("12.345"). */
  static fromDecimalString(input: string): Result<Money, ValidationError> {
    const scaled = parseScaled(input, SCALE);
    if (scaled === undefined) {
      return err(new ValidationError('Money must be a decimal with at most 2 decimals', { input }));
    }
    return ok(new Money(scaled));
  }

  add(other: Money): Money {
    return new Money(this.centavos + other.centavos);
  }

  subtract(other: Money): Money {
    return new Money(this.centavos - other.centavos);
  }

  /** Price times quantity, rounded once to the centavo (HALF_UP unless told otherwise). */
  multiplyByQuantity(quantity: Quantity, rounding: RoundingMode = 'HALF_UP'): Money {
    const product = this.centavos * quantity.toThousandths();
    return new Money(divideRounded(product, 1000n, rounding));
  }

  /**
   * Splits the amount in proportion to `ratios` (non-negative integers, at least one above zero)
   * without losing a centavo: the parts always add up to the amount. Leftover centavos go one by
   * one to the first parts with a non-zero ratio.
   */
  allocate(ratios: readonly number[]): Money[] {
    const weights = ratios.map((ratio) => toBigInt(ratio, 'Ratio'));
    const total = weights.reduce((sum, weight) => sum + weight, 0n);
    if (weights.some((weight) => weight < 0n) || total === 0n) {
      throw new RangeError('Ratios must be non-negative with at least one above zero');
    }
    const sign = this.centavos < 0n ? -1n : 1n;
    const magnitude = this.centavos * sign;
    const shares = weights.map((weight) => ({ weight, share: (magnitude * weight) / total }));
    let leftover = magnitude - shares.reduce((sum, { share }) => sum + share, 0n);
    return shares.map(({ weight, share }) => {
      const getsExtra = leftover > 0n && weight > 0n;
      if (getsExtra) leftover -= 1n;
      return new Money((getsExtra ? share + 1n : share) * sign);
    });
  }

  compare(other: Money): -1 | 0 | 1 {
    if (this.centavos === other.centavos) return 0;
    return this.centavos < other.centavos ? -1 : 1;
  }

  equals(other: Money): boolean {
    return this.centavos === other.centavos;
  }

  isNegative(): boolean {
    return this.centavos < 0n;
  }

  toCentavos(): bigint {
    return this.centavos;
  }

  /** Always 2 decimals: "12.50", "-0.05". */
  toDecimalString(): string {
    return formatScaled(this.centavos, SCALE);
  }
}
