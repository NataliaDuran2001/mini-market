import { describe, expect, it } from 'vitest';
import { Period, ValidationError } from '../src/index.js';

const LA_PAZ = 'America/La_Paz';
const iso = (date: Date): string => date.toISOString();

describe('Period', () => {
  it('puts 2026-10-31T23:30:00-04:00 in October for America/La_Paz', () => {
    // AC-3
    const period = Period.fromDate(new Date('2026-10-31T23:30:00-04:00'), LA_PAZ);
    expect(period).toEqual({ year: 2026, month: 10 });
  });

  it('keeps 2026-11-01T03:30:00Z in October (still Oct 31 in La Paz) and moves 04:00Z to November', () => {
    // AC-3
    expect(Period.fromDate(new Date('2026-11-01T03:30:00Z'), LA_PAZ)).toEqual({
      year: 2026,
      month: 10,
    });
    expect(Period.fromDate(new Date('2026-11-01T03:59:59.999Z'), LA_PAZ).toString()).toBe(
      '2026-10',
    );
    expect(Period.fromDate(new Date('2026-11-01T04:00:00Z'), LA_PAZ).toString()).toBe('2026-11');
  });

  it('depends on the zone: the same instant is November in UTC', () => {
    // AC-3
    expect(Period.fromDate(new Date('2026-11-01T03:30:00Z'), 'UTC').toString()).toBe('2026-11');
  });

  it('builds the day key in the tenant zone for daily grouping', () => {
    // AC-3
    expect(Period.dayKey(new Date('2026-11-01T03:30:00Z'), LA_PAZ)).toBe('2026-10-31');
    expect(Period.dayKey(new Date('2026-11-01T04:00:00Z'), LA_PAZ)).toBe('2026-11-01');
    expect(Period.dayKey(new Date('2026-01-05T12:00:00Z'), LA_PAZ)).toBe('2026-01-05');
  });

  it('gives the half-open UTC range of the month in La Paz (UTC-4, no DST)', () => {
    // AC-3
    const october = Period.of(2026, 10);
    expect(iso(october.startOf(LA_PAZ))).toBe('2026-10-01T04:00:00.000Z');
    expect(iso(october.endOfExclusive(LA_PAZ))).toBe('2026-11-01T04:00:00.000Z');
  });

  it('rolls December over to January of the next year', () => {
    // AC-3
    const december = Period.of(2026, 12);
    expect(iso(december.startOf(LA_PAZ))).toBe('2026-12-01T04:00:00.000Z');
    expect(iso(december.endOfExclusive(LA_PAZ))).toBe('2027-01-01T04:00:00.000Z');
  });

  it('follows DST offsets of a zone that has them (the range is not always 30 x 24h)', () => {
    // AC-3
    const march = Period.of(2026, 3);
    expect(iso(march.startOf('America/New_York'))).toBe('2026-03-01T05:00:00.000Z'); // EST
    expect(iso(march.endOfExclusive('America/New_York'))).toBe('2026-04-01T04:00:00.000Z'); // EDT
    expect(iso(march.startOf('UTC'))).toBe('2026-03-01T00:00:00.000Z');
  });

  it('handles zones ahead of UTC and half-hour offsets', () => {
    // AC-3
    expect(iso(Period.of(2026, 10).startOf('Asia/Kolkata'))).toBe('2026-09-30T18:30:00.000Z');
    expect(iso(Period.of(2026, 10).startOf('Pacific/Auckland'))).toBe('2026-09-30T11:00:00.000Z');
  });

  it('every instant of the month falls inside [startOf, endOfExclusive) and the neighbours fall outside', () => {
    // AC-3
    const october = Period.of(2026, 10);
    const start = october.startOf(LA_PAZ).getTime();
    const end = october.endOfExclusive(LA_PAZ).getTime();
    expect(Period.fromDate(new Date(start), LA_PAZ).equals(october)).toBe(true);
    expect(Period.fromDate(new Date(end - 1), LA_PAZ).equals(october)).toBe(true);
    expect(Period.fromDate(new Date(start - 1), LA_PAZ).equals(october)).toBe(false);
    expect(Period.fromDate(new Date(end), LA_PAZ).equals(october)).toBe(false);
  });

  it('parses and prints the YYYY-MM period of an expense (S5)', () => {
    const parsed = Period.parse('2026-10');
    expect(parsed.ok && parsed.value.toString()).toBe('2026-10');
    expect(Period.of(999 + 1, 1).toString()).toBe('1000-01');
  });

  it.each(['2026-13', '2026-00', '2026-1', '26-10', 'x', '', '2026-10-01', '0999-10'])(
    'rejects the period text %j with a Validation error',
    (input) => {
      const result = Period.parse(input);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error).toBeInstanceOf(ValidationError);
    },
  );

  it.each([
    [999, 1],
    [10000, 1],
    [2026.5, 1],
    [2026, 0],
    [2026, 13],
    [2026, 1.5],
  ])('rejects Period.of(%s, %s) as a caller bug', (year, month) => {
    expect(() => Period.of(year, month)).toThrow(RangeError);
  });

  it('compares by value', () => {
    expect(Period.of(2026, 10).equals(Period.of(2026, 10))).toBe(true);
    expect(Period.of(2026, 10).equals(Period.of(2026, 11))).toBe(false);
    expect(Period.of(2026, 10).equals(Period.of(2025, 10))).toBe(false);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(Period.of(2026, 10))).toBe(true);
  });

  it('fails loudly on an unknown time zone or an invalid date', () => {
    expect(() => Period.fromDate(new Date(), 'Mars/Base')).toThrow(RangeError);
    expect(() => Period.of(2026, 10).startOf('Mars/Base')).toThrow(RangeError);
    expect(() => Period.fromDate(new Date(Number.NaN), LA_PAZ)).toThrow(RangeError);
  });

  it('handles instants before 1970 and with milliseconds', () => {
    expect(Period.dayKey(new Date('1969-12-31T23:59:59.999Z'), 'UTC')).toBe('1969-12-31');
    expect(iso(Period.of(1969, 12).startOf(LA_PAZ))).toBe('1969-12-01T04:00:00.000Z');
  });
});
