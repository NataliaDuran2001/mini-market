// Quantity: fixed point with 3 decimals, stored as bigint thousandths (ADR 0004, numeric(14,3)).
import { formatScaled, inputPreview, parseScaled, toBigInt } from './decimal.js';
import { ValidationError } from './domain-error.js';
import { err, ok, type Result } from './result.js';

const SCALE = 3;
// numeric(14,3) holds 11 integer digits and 3 decimals (ADR 0004).
const MAX_THOUSANDTHS = 10n ** 14n - 1n;

export class Quantity {
  private readonly thousandths: bigint;

  private constructor(thousandths: bigint) {
    this.thousandths = thousandths;
    Object.freeze(this);
  }

  static fromThousandths(value: number | bigint): Quantity {
    return new Quantity(toBigInt(value, 'Quantity thousandths'));
  }

  static zero(): Quantity {
    return new Quantity(0n);
  }

  /** Parses a decimal string with at most 3 decimals ("0.333"). Returns a Validation error otherwise. */
  static tryParse(input: string): Result<Quantity, ValidationError> {
    const scaled = parseScaled(input, SCALE);
    if (scaled === undefined || scaled > MAX_THOUSANDTHS || scaled < -MAX_THOUSANDTHS) {
      return err(
        new ValidationError('Quantity must be a decimal with at most 3 decimals within range', {
          input: inputPreview(input),
        }),
      );
    }
    return ok(new Quantity(scaled));
  }

  /** Like tryParse but throws the ValidationError. For literals and already validated input. */
  static parse(input: string): Quantity {
    const result = Quantity.tryParse(input);
    if (!result.ok) throw result.error;
    return result.value;
  }

  add(other: Quantity): Quantity {
    return new Quantity(this.thousandths + other.thousandths);
  }

  subtract(other: Quantity): Quantity {
    return new Quantity(this.thousandths - other.thousandths);
  }

  /** Converts presentations to base units (S11): quantity times an integer factor, exact. */
  multiplyFactor(factor: number | bigint): Quantity {
    const multiplier = toBigInt(factor, 'Factor');
    if (multiplier <= 0n) throw new RangeError('Factor must be a positive integer');
    return new Quantity(this.thousandths * multiplier);
  }

  compare(other: Quantity): -1 | 0 | 1 {
    if (this.thousandths === other.thousandths) return 0;
    return this.thousandths < other.thousandths ? -1 : 1;
  }

  equals(other: Quantity): boolean {
    return this.thousandths === other.thousandths;
  }

  isPositive(): boolean {
    return this.thousandths > 0n;
  }

  isNegative(): boolean {
    return this.thousandths < 0n;
  }

  toThousandths(): bigint {
    return this.thousandths;
  }

  /** Always 3 decimals, the same text Postgres returns for numeric(14,3): "10.000". */
  toString(): string {
    return formatScaled(this.thousandths, SCALE);
  }
}
