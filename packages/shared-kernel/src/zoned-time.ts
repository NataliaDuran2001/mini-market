// Calendar math in an IANA time zone using Intl only (ADR 0008). Internal to the kernel.

interface ZonedParts {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

/** Wall-clock fields of `instant` in `timeZone`. Throws RangeError for a bad zone or date. */
export function zonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  });
  const fields: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    fields[part.type] = Number(part.value);
  }
  return fields as unknown as ZonedParts; // formatToParts always yields these six numeric fields
}

/** Zone offset from UTC, in milliseconds, at `instantMs` (negative west of Greenwich). */
function offsetAt(instantMs: number, timeZone: string): number {
  const p = zonedParts(new Date(instantMs), timeZone);
  const wallAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const wholeSeconds = instantMs - (((instantMs % 1000) + 1000) % 1000);
  return wallAsUtc - wholeSeconds;
}

/** The UTC instant at which the wall clock of `timeZone` reads 00:00 on the given calendar day. */
export function zonedMidnightToUtc(
  year: number,
  month: number,
  day: number,
  timeZone: string,
): Date {
  const wall = Date.UTC(year, month - 1, day);
  const firstGuess = wall - offsetAt(wall, timeZone);
  // The offset can differ at the corrected instant when a DST change sits between the two.
  return new Date(wall - offsetAt(firstGuess, timeZone));
}
