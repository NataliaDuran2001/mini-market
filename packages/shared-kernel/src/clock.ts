// Time is injected (ADR 0016). Domain and application code call `clock.now()`, never `new Date()`.

export interface Clock {
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

/** Test clock that returns the same instant until it is set again. */
export class FixedClock implements Clock {
  private instant: Date;

  constructor(instant: Date | string) {
    this.instant = toValidDate(instant);
  }

  now(): Date {
    return new Date(this.instant);
  }

  set(instant: Date | string): void {
    this.instant = toValidDate(instant);
  }
}

function toValidDate(instant: Date | string): Date {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid instant: ${String(instant)}`);
  }
  return date;
}
