import { describe, expect, it } from 'vitest';
import { describeError } from './describe-error';

describe('describeError', () => {
  it('drops the bound parameters that drizzle-orm appends to a failed query message', () => {
    // docs/05-security.md: no secrets or customer data in logs
    const failure = new Error(
      'Failed query: insert into customers (name) values ($1)\nparams: Ana Pérez',
      {
        cause: Object.assign(new Error('duplicate key value violates unique constraint "x"'), {
          code: '23505',
        }),
      },
    );

    const description = describeError(failure);

    expect(JSON.stringify(description)).not.toContain('Ana Pérez');
    expect(description).toEqual({
      name: 'Error',
      message: 'Failed query: insert into customers (name) values ($1)',
      code: '23505',
      cause: 'duplicate key value violates unique constraint "x"',
    });
  });

  it('describes a plain error and never stringifies a thrown non-error', () => {
    expect(describeError(new TypeError('bad input'))).toEqual({
      name: 'TypeError',
      message: 'bad input',
    });
    expect(describeError({ secret: 'token' })).toEqual({
      name: 'NonErrorThrown',
      message: 'object',
    });
  });
});
