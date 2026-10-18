// Issue #81: Period.dayRange and the month range, in the tenant timezone (ADR 0008).
import { describe, expect, it } from 'vitest';
import { Period, ValidationError, type UtcRange } from '../src/index.js';

const LA_PAZ = 'America/La_Paz';
const SANTIAGO = 'America/Santiago';
const HOUR_MS = 3_600_000;

const iso = (date: Date): string => date.toISOString();

function dayRange(dayKey: string, timeZone: string): UtcRange {
  const result = Period.dayRange(dayKey, timeZone);
  if (!result.ok) throw result.error;
  return result.value;
}

const hoursIn = (range: UtcRange): number =>
  (range.end.getTime() - range.start.getTime()) / HOUR_MS;

describe('Period.dayRange', () => {
  it('gives 2026-10-18 in America/La_Paz as [04:00Z, next day 04:00Z)', () => {
    // AC-3
    const range = dayRange('2026-10-18', LA_PAZ);
    expect(iso(range.start)).toBe('2026-10-18T04:00:00.000Z');
    expect(iso(range.end)).toBe('2026-10-19T04:00:00.000Z');
  });

  it('is the inverse of dayKey at both edges of the interval', () => {
    // AC-3
    const range = dayRange('2026-10-18', LA_PAZ);
    expect(Period.dayKey(range.start, LA_PAZ)).toBe('2026-10-18');
    expect(Period.dayKey(new Date(range.end.getTime() - 1), LA_PAZ)).toBe('2026-10-18');
    expect(Period.dayKey(range.end, LA_PAZ)).toBe('2026-10-19');
  });

  it('rolls over month and year ends and leap days', () => {
    // AC-3
    expect(iso(dayRange('2026-10-31', LA_PAZ).end)).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(dayRange('2026-12-31', LA_PAZ).end)).toBe('2027-01-01T04:00:00.000Z');
    expect(iso(dayRange('2028-02-28', 'UTC').end)).toBe('2028-02-29T00:00:00.000Z');
    expect(iso(dayRange('2028-02-29', 'UTC').end)).toBe('2028-03-01T00:00:00.000Z');
    expect(iso(dayRange('2026-02-28', 'UTC').end)).toBe('2026-03-01T00:00:00.000Z');
  });

  it('handles zones ahead of UTC', () => {
    // AC-3
    const range = dayRange('2026-10-18', 'Asia/Kolkata');
    expect(iso(range.start)).toBe('2026-10-17T18:30:00.000Z');
    expect(iso(range.end)).toBe('2026-10-18T18:30:00.000Z');
  });

  it('is 25 hours on the Santiago fall-back day and 23 on the spring-forward day', () => {
    // AC-4
    const fallBack = dayRange('2026-04-04', SANTIAGO);
    expect(hoursIn(fallBack)).toBe(25);
    expect(iso(fallBack.start)).toBe('2026-04-04T03:00:00.000Z');
    expect(iso(fallBack.end)).toBe('2026-04-05T04:00:00.000Z');

    const springForward = dayRange('2026-09-06', SANTIAGO);
    expect(hoursIn(springForward)).toBe(23);
    // Midnight does not exist that day: the day starts at its first real instant, 01:00 local.
    expect(iso(springForward.start)).toBe('2026-09-06T04:00:00.000Z');
    expect(iso(springForward.end)).toBe('2026-09-07T03:00:00.000Z');
    // The instant just before the day starts still reads as the previous day in dayKey.
    expect(Period.dayKey(new Date(springForward.start.getTime() - 1), SANTIAGO)).toBe('2026-09-05');
    expect(Period.dayKey(springForward.start, SANTIAGO)).toBe('2026-09-06');
  });

  it('starts at the first occurrence when midnight happens twice (America/Havana, 2026-11-01)', () => {
    // AC-4
    const range = dayRange('2026-11-01', 'America/Havana');
    expect(hoursIn(range)).toBe(25);
    expect(iso(range.start)).toBe('2026-11-01T04:00:00.000Z');
    expect(iso(range.end)).toBe('2026-11-02T05:00:00.000Z');
  });

  it('leaves no gap and no overlap between consecutive days across DST changes', () => {
    // AC-4
    for (const [first, days] of [
      ['2026-04-02', 6],
      ['2026-09-04', 6],
    ] as const) {
      let previous: UtcRange | undefined;
      for (let offset = 0; offset < days; offset += 1) {
        const key = new Date(Date.parse(`${first}T00:00:00Z`) + offset * 24 * HOUR_MS)
          .toISOString()
          .slice(0, 10);
        const range = dayRange(key, SANTIAGO);
        expect(range.end.getTime()).toBeGreaterThan(range.start.getTime());
        if (previous) expect(range.start.getTime()).toBe(previous.end.getTime());
        previous = range;
      }
    }
  });

  it('has 24 hours on ordinary days of a DST zone', () => {
    // AC-4
    expect(hoursIn(dayRange('2026-07-15', SANTIAGO))).toBe(24);
  });

  it.each(['2026-13-01', '2026-00-10', '2026-10-00', '2026-10-32', '2026-02-29', '0999-01-01'])(
    'rejects the impossible day key %j with a Validation error',
    (dayKey) => {
      // AC-6
      const result = Period.dayRange(dayKey, LA_PAZ);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it.each(['', '2026-10', '2026-1-18', '26-10-18', '2026-10-18T00:00', ' 2026-10-18', 'x'])(
    'rejects the malformed day key %j with a Validation error',
    (dayKey) => {
      // AC-6
      const result = Period.dayRange(dayKey, LA_PAZ);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
    },
  );

  it('rejects an unknown time zone with a Validation error', () => {
    // AC-6
    for (const timeZone of ['Mars/Base', '', 'not a zone']) {
      const result = Period.dayRange('2026-10-18', timeZone);
      expect(result.ok, timeZone).toBe(false);
      if (result.ok) continue;
      expect(result.error).toBeInstanceOf(ValidationError);
      expect(result.error.code).toBe('VALIDATION_ERROR');
      expect(result.error.details).toEqual({ timeZone });
    }
  });

  it('reports the day key first when both inputs are invalid', () => {
    // AC-6
    const result = Period.dayRange('2026-02-30', 'Mars/Base');
    expect(!result.ok && result.error.details).toEqual({ input: '2026-02-30' });
  });
});

describe('Period.range (month)', () => {
  it('starts at the first local midnight and ends at the first local midnight of the next month', () => {
    // AC-5
    const range = Period.of(2026, 10).range(LA_PAZ);
    expect(iso(range.start)).toBe('2026-10-01T04:00:00.000Z');
    expect(iso(range.end)).toBe('2026-11-01T04:00:00.000Z');
  });

  it('matches startOf and endOfExclusive and rolls December into January', () => {
    // AC-5
    const december = Period.of(2026, 12);
    const range = december.range(LA_PAZ);
    expect(range.start).toEqual(december.startOf(LA_PAZ));
    expect(range.end).toEqual(december.endOfExclusive(LA_PAZ));
    expect(iso(range.end)).toBe('2027-01-01T04:00:00.000Z');
  });

  it('is exactly the union of its day ranges', () => {
    // AC-5
    const october = Period.of(2026, 10);
    const month = october.range(LA_PAZ);
    expect(iso(dayRange('2026-10-01', LA_PAZ).start)).toBe(iso(month.start));
    expect(iso(dayRange('2026-10-31', LA_PAZ).end)).toBe(iso(month.end));
  });

  it('throws RangeError for an unknown zone, like startOf', () => {
    expect(() => Period.of(2026, 10).range('Mars/Base')).toThrow(RangeError);
  });
});
