import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime } from './date';

describe('date formatting in America/La_Paz', () => {
  it('shows the La Paz calendar day, not the UTC day', () => {
    // 03:30Z on Nov 1st is still Oct 31st at 23:30 in La Paz (UTC-4)
    expect(formatDate('2026-11-01T03:30:00Z')).toBe('31/10/2026');
  });

  it('formats date and 24-hour time in the tenant timezone', () => {
    expect(formatDateTime('2026-11-01T03:30:00Z')).toBe('31/10/2026, 23:30');
    expect(formatDateTime(new Date('2026-10-15T14:00:00Z'))).toBe('15/10/2026, 10:00');
  });

  it('honours another timezone when the tenant has one', () => {
    expect(formatDate('2026-11-01T03:30:00Z', { timeZone: 'UTC' })).toBe('01/11/2026');
  });
});
