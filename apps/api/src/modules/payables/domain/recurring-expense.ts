// Recurring expense templates (S5): fixed monthly costs that generate one expense per period.
import { err, ok } from '@mini-market/shared-kernel';
import type { Money, Period, Result } from '@mini-market/shared-kernel';
import { InvalidScheduleError } from './errors';

export interface RecurringExpense {
  readonly id: string;
  readonly tenantId: string;
  readonly expenseCategoryId: string;
  readonly name: string;
  readonly amount: Money;
  /** 1 to 31; a month with fewer days uses its last day. */
  readonly dayOfMonthDue: number;
  readonly active: boolean;
  readonly startsPeriod: Period;
  /** Last period that generates an expense, or null for no end. */
  readonly endsPeriod: Period | null;
  /** The owner who set it up; the expenses it generates carry the same author. */
  readonly createdBy: string;
}

const monthsOf = (period: Period): number => period.year * 12 + period.month;

/** Negative when `a` is before `b`, zero when equal, positive when after. */
export const comparePeriods = (a: Period, b: Period): number => monthsOf(a) - monthsOf(b);

/** A template generates for `period` while it is active and the period is inside its range. */
export function generatesFor(
  template: Pick<RecurringExpense, 'active' | 'startsPeriod' | 'endsPeriod'>,
  period: Period,
): boolean {
  if (!template.active) return false;
  if (comparePeriods(period, template.startsPeriod) < 0) return false;
  return template.endsPeriod === null || comparePeriods(period, template.endsPeriod) <= 0;
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** "YYYY-MM-DD" of the due day inside `period`; day 31 in February is the 28th (or 29th). */
export function dueDateFor(period: Period, dayOfMonthDue: number): string {
  const daysInMonth = new Date(Date.UTC(period.year, period.month, 0)).getUTCDate();
  return `${String(period.year).padStart(4, '0')}-${pad(period.month)}-${pad(Math.min(dayOfMonthDue, daysInMonth))}`;
}

/** A template that ends before it starts would never generate anything: reject it. */
export function checkSchedule(
  startsPeriod: Period,
  endsPeriod: Period | null,
): Result<void, InvalidScheduleError> {
  if (endsPeriod !== null && comparePeriods(endsPeriod, startsPeriod) < 0) {
    return err(new InvalidScheduleError('A recurring expense cannot end before it starts'));
  }
  return ok(undefined);
}
