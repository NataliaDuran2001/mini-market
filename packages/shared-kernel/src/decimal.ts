// Fixed-point decimal text <-> scaled bigint. Internal to the kernel.

const DECIMAL_PATTERN = /^-?\d+(\.\d+)?$/;
const MAX_DECIMAL_LENGTH = 32;

/**
 * Parses "-12.5" with `scale` decimals into a scaled integer (1250n for scale 2).
 * Returns undefined when the text is not a plain decimal or has more than `scale` decimals.
 */
export function parseScaled(input: string, scale: number): bigint | undefined {
  if (input.length > MAX_DECIMAL_LENGTH || !DECIMAL_PATTERN.test(input)) return undefined;
  const negative = input.startsWith('-');
  const [whole, fraction] = (negative ? input.slice(1) : input).split('.') as [
    string, // the pattern guarantees at least one digit before the dot
    string | undefined,
  ];
  const decimals = fraction ?? '';
  if (decimals.length > scale) return undefined;
  const magnitude = BigInt(whole + decimals.padEnd(scale, '0'));
  return negative ? -magnitude : magnitude;
}

/** First 32 characters of user input, safe to put in an error body (never echo megabytes). */
export function inputPreview(input: string): string {
  return input.length > MAX_DECIMAL_LENGTH ? `${input.slice(0, MAX_DECIMAL_LENGTH)}...` : input;
}

/** Formats a scaled integer with exactly `scale` decimals: (-5n, 2) gives "-0.05". */
export function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(scale + 1, '0');
  const split = digits.length - scale;
  return `${negative ? '-' : ''}${digits.slice(0, split)}.${digits.slice(split)}`;
}

/** Accepts a bigint or a safe integer number; anything else is a programming error. */
export function toBigInt(value: number | bigint, label: string): bigint {
  if (typeof value === 'bigint') return value;
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be a safe integer, got ${String(value)}`);
  }
  return BigInt(value);
}
