import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS, buildLoggerParams, resolveRequestId } from './logger.config';

function captureLines(): { stream: Writable; lines: () => Record<string, unknown>[] } {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  return {
    stream,
    lines: () =>
      chunks
        .join('')
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}

describe('logger configuration', () => {
  it('redacts authorization, cookie and password values', () => {
    // AC-5 (unit: the redaction paths)
    const { stream, lines } = captureLines();
    const logger = pino({ redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' } }, stream);

    logger.info({
      req: { headers: { authorization: 'Bearer secret-token', cookie: 'sid=secret-cookie' } },
      user: { password: 'secret-password', token: 'secret-token' },
    });

    const [line] = lines();
    const text = JSON.stringify(line);
    expect(text).not.toMatch(/secret-(token|cookie|password)/);
    expect(line).toMatchObject({
      req: { headers: { authorization: '[Redacted]', cookie: '[Redacted]' } },
      user: { password: '[Redacted]', token: '[Redacted]' },
    });
  });

  it('feeds the redaction paths and the log level to pino-http', () => {
    const { stream } = captureLines();
    const params = buildLoggerParams({ logLevel: 'warn', nodeEnv: 'test' }, stream);
    expect(params.pinoHttp).toEqual([
      expect.objectContaining({
        level: 'warn',
        redact: { paths: [...LOG_REDACT_PATHS], censor: '[Redacted]' },
      }),
      stream,
    ]);
  });

  it('echoes a plain incoming request id and replaces an unsafe one', () => {
    const headers: Record<string, string> = {};
    const res = { setHeader: (name: string, value: string) => void (headers[name] = value) };
    const call = (incoming: string | undefined) =>
      resolveRequestId(
        { headers: incoming === undefined ? {} : { 'x-request-id': incoming } } as never, // minimal request double
        res as never, // minimal response double
      );

    expect(call('abc-123')).toBe('abc-123');
    const replaced = call('bad id\nwith newline');
    expect(replaced).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers['x-request-id']).toBe(replaced);
    expect(call(undefined)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
