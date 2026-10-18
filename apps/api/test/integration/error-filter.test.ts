import { apiErrorSchema } from '@mini-market/contracts/common';
import { ConflictError, NotFoundError } from '@mini-market/shared-kernel';
import { BadRequestException, Body, Controller, Get, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../../src/modules/access';
import { createTestApp } from '../create-test-app';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

class StockDto extends createZodDto(z.object({ quantity: z.string().regex(/^\d+$/) })) {}

@Public()
@Controller('probe')
class ProbeController {
  @Get('domain-error')
  domainError(): never {
    throw new ConflictError('Already exists', { field: 'code' });
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundError('No such thing');
  }

  @Get('http-error')
  httpError(): never {
    throw new BadRequestException('plain nest error');
  }

  @Get('bug')
  bug(): never {
    throw new Error('connection string postgres://user:secret@host leaked');
  }

  @Post('body')
  body(@Body() body: StockDto): StockDto {
    return body;
  }
}

describe('error responses', () => {
  let testDb: TestDb;
  let app: INestApplication;

  beforeAll(async () => {
    testDb = await createTestDb();
    app = await createTestApp({ database: testDb.db, controllers: [ProbeController] });
  });

  afterAll(async () => {
    await app.close();
    await testDb.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(`/api/v1/probe/${path}`);

  it('keeps the code, status and details of a DomainError', async () => {
    // docs/04-coding-standards.md section 4: one filter maps DomainError to HTTP
    const response = await get('domain-error').expect(409);
    expect(response.body).toMatchObject({
      code: 'CONFLICT',
      message: 'Already exists',
      details: { field: 'code' },
    });
    expect(apiErrorSchema.safeParse(response.body).success).toBe(true);
    await get('not-found').expect(404);
  });

  it('adds the request id so a report can be matched with the logs', async () => {
    const response = await get('domain-error').set('x-request-id', 'trace-7').expect(409);
    expect(response.body.requestId).toBe('trace-7');
  });

  it('gives framework exceptions a stable code', async () => {
    const response = await get('http-error').expect(400);
    expect(response.body).toMatchObject({ code: 'BAD_REQUEST', message: 'plain nest error' });
    const missing = await request(app.getHttpServer()).get('/api/v1/nothing-here').expect(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('turns a body that fails the schema into VALIDATION_ERROR with the failing paths', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/probe/body')
      .send({ quantity: 'ten' })
      .expect(400);
    expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(response.body.details.issues).toEqual([
      { path: 'quantity', message: expect.any(String) },
    ]);
    expect(JSON.stringify(response.body)).not.toContain('ten');
  });

  it('answers a bug with 500 and no internals', async () => {
    const response = await get('bug').expect(500);
    expect(response.body).toMatchObject({
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    });
    expect(JSON.stringify(response.body)).not.toMatch(/secret|postgres/);
  });

  it('maps errors raised before routing, such as an oversized body, to a stable code', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/probe/body')
      .send({ quantity: '1'.repeat(1_100_000) })
      .expect(413);
    expect(response.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
  });
});
