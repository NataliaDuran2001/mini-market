// Period: a calendar month in the tenant timezone (ADR 0008, S5). Day keys group daily reports.
// Queries use the half-open UTC range [startOf, endOfExclusive). Never date_trunc in UTC.
import { inputPreview } from './decimal.js';
import { ValidationError } from './domain-error.js';
import { err, ok, type Result } from './result.js';
import { zonedMidnightToUtc, zonedParts } from './zoned-time.js';

const PERIOD_PATTERN = /^(\d{4})-(\d{2})$/;
const MIN_YEAR = 1000;
const MAX_YEAR = 9999;

const DAY_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number, width: number): string => String(value).padStart(width, '0');

/** Half-open UTC interval `[start, end)`: `start` is inside, `end` is the first instant after. */
export interface UtcRange {
  readonly start: Date;
  readonly end: Date;
}

const isKnownTimeZone = (timeZone: string): boolean => {
  try {
    zonedParts(new Date(0), timeZone);
    return true;
  } catch {
    return false;
  }
};

/** Splits "YYYY-MM-DD" into numbers, or undefined when it is not a real calendar day. */
const parseDayKey = (
  dayKey: string,
): { readonly year: number; readonly month: number; readonly day: number } | undefined => {
  const match = DAY_KEY_PATTERN.exec(dayKey);
  if (match === null) return undefined;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const real = year >= MIN_YEAR && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth;
  return real ? { year, month, day } : undefined;
};

export class Period {
  readonly year: number;
  readonly month: number;

  private constructor(year: number, month: number) {
    this.year = year;
    this.month = month;
    Object.freeze(this);
  }

  /** `month` is 1 to 12. Throws RangeError when out of range (a caller bug). */
  static of(year: number, month: number): Period {
    if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
      throw new RangeError(`Year must be an integer from ${MIN_YEAR} to ${MAX_YEAR}`);
    }
    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new RangeError('Month must be an integer from 1 to 12');
    }
    return new Period(year, month);
  }

  /** Parses "YYYY-MM", the `period` of an expense (S5). */
  static parse(input: string): Result<Period, ValidationError> {
    const match = PERIOD_PATTERN.exec(input);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (year >= MIN_YEAR && month >= 1 && month <= 12) return ok(new Period(year, month));
    }
    return err(new ValidationError('Period must be YYYY-MM', { input: inputPreview(input) }));
  }

  /** The month `date` falls in, seen from `timeZone`. */
  static fromDate(date: Date, timeZone: string): Period {
    const { year, month } = zonedParts(date, timeZone);
    return new Period(year, month);
  }

  /** The calendar day `date` falls in, seen from `timeZone`, as "YYYY-MM-DD". */
  static dayKey(date: Date, timeZone: string): string {
    const { year, month, day } = zonedParts(date, timeZone);
    return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  }

  /**
   * Half-open UTC range of the local day "YYYY-MM-DD" in `timeZone`: from its first local instant
   * to the first local instant of the next day. A DST day is 23 or 25 hours long, and consecutive
   * days share their boundary, so no instant is lost or counted twice.
   * An invalid day key or unknown time zone is an expected failure of caller input, so it returns
   * a ValidationError like `parse` (unlike `startOf`, whose zone comes from trusted settings).
   */
  static dayRange(dayKey: string, timeZone: string): Result<UtcRange, ValidationError> {
    const parts = parseDayKey(dayKey);
    if (parts === undefined) {
      return err(new ValidationError('Day must be YYYY-MM-DD', { input: inputPreview(dayKey) }));
    }
    const { year, month, day } = parts;
    if (!isKnownTimeZone(timeZone)) {
      return err(new ValidationError('Unknown time zone', { timeZone: inputPreview(timeZone) }));
    }
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    return ok({
      start: zonedMidnightToUtc(year, month, day, timeZone),
      end: zonedMidnightToUtc(
        nextDay.getUTCFullYear(),
        nextDay.getUTCMonth() + 1,
        nextDay.getUTCDate(),
        timeZone,
      ),
    });
  }

  /** The whole month as the half-open UTC range `[startOf, endOfExclusive)`, same shape as `dayRange`. */
  range(timeZone: string): UtcRange {
    return { start: this.startOf(timeZone), end: this.endOfExclusive(timeZone) };
  }

  /** Inclusive UTC start: the first instant of the month in `timeZone`. */
  startOf(timeZone: string): Date {
    return zonedMidnightToUtc(this.year, this.month, 1, timeZone);
  }

  /** Exclusive UTC end: the first instant of the next month in `timeZone`. */
  endOfExclusive(timeZone: string): Date {
    const rollsOver = this.month === 12;
    return zonedMidnightToUtc(
      rollsOver ? this.year + 1 : this.year,
      rollsOver ? 1 : this.month + 1,
      1,
      timeZone,
    );
  }

  equals(other: Period): boolean {
    return this.year === other.year && this.month === other.month;
  }

  toString(): string {
    return `${pad(this.year, 4)}-${pad(this.month, 2)}`;
  }
}
