export const DEFAULT_TIME_ZONE = 'America/La_Paz';
const DEFAULT_LOCALE = 'es-BO';

export interface DateFormatOptions {
  /** IANA zone; the tenant timezone (ADR 0008). Defaults to America/La_Paz. */
  readonly timeZone?: string;
  readonly locale?: string;
}

function toDate(value: Date | string): Date {
  return typeof value === 'string' ? new Date(value) : value;
}

/** `dd/mm/yyyy` of the instant as seen in the tenant timezone, never in the browser's. */
export function formatDate(value: Date | string, options: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(toDate(value));
}

/** `dd/mm/yyyy, hh:mm` (24 hours) in the tenant timezone. */
export function formatDateTime(value: Date | string, options: DateFormatOptions = {}): string {
  return new Intl.DateTimeFormat(options.locale ?? DEFAULT_LOCALE, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: options.timeZone ?? DEFAULT_TIME_ZONE,
  }).format(toDate(value));
}
