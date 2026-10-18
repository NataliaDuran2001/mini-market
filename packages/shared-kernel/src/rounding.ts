// Exact integer division with explicit rounding. Internal to the kernel, only RoundingMode is public.

/**
 * HALF_UP rounds a tie away from zero (2.5 becomes 3, -2.5 becomes -3), the "nearest centavo"
 * of S3. DOWN truncates toward zero.
 */
export type RoundingMode = 'HALF_UP' | 'DOWN';

export function divideRounded(
  numerator: bigint,
  denominator: bigint,
  mode: RoundingMode = 'HALF_UP',
): bigint {
  if (denominator <= 0n) {
    throw new RangeError('Denominator must be positive');
  }
  const quotient = numerator / denominator;
  const remainder = numerator % denominator;
  if (remainder === 0n) return quotient;
  switch (mode) {
    case 'DOWN':
      return quotient;
    case 'HALF_UP':
      break;
    default:
      throw new RangeError(`Unknown rounding mode: ${String(mode satisfies never)}`);
  }
  const magnitude = remainder < 0n ? -remainder : remainder;
  if (magnitude * 2n < denominator) return quotient;
  return numerator < 0n ? quotient - 1n : quotient + 1n;
}
