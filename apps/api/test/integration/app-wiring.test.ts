import { Body, Controller, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import request from 'supertest';
import { afterEach, beforeAll, afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Public } from '../../src/modules/access';
import { createTestApp, testEnv } from '../create-test-app';
import { createTestDb } from '../harness';
import type { TestDb } from '../harness';

class ProbeDto extends createZodDto(z.object({ name: z.string().min(1) })) {}

@Public()
@Controller('probe')
class ProbeController {
  @Post()
  create(@Body() body: ProbeDto): { name: string } {
    return { name: body.name };
  }
}

describe('application wiring', () => {
  let testDb: TestDb;
  let app: INestApplication | undefined;

  beforeAll(async () => {
    testDb = await createTestDb();
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  afterAll(async () => {
    await testDb.close();
  });

  it('validates request bodies against the Zod schema of the DTO, globally', async () => {
    // Issue #3 scope: global ZodValidationPipe. Proves decorator metadata reaches the pipe, which
    // every later controller depends on.
    app = await createTestApp({ database: testDb.db, controllers: [ProbeController] });

    await request(app.getHttpServer()).post('/api/v1/probe').send({}).expect(400);
    await request(app.getHttpServer()).post('/api/v1/probe').send({ name: '' }).expect(400);
    const ok = await request(app.getHttpServer())
      .post('/api/v1/probe')
      .send({ name: 'Ana' })
      .expect(201);
    expect(ok.body).toEqual({ name: 'Ana' });
  });

  it('does not serve Swagger UI or the OpenAPI document in production', async () => {
    // docs/05-security.md section 4: Swagger UI only when NODE_ENV is not production
    app = await createTestApp({
      database: testDb.db,
      env: testEnv({ NODE_ENV: 'production' }),
    });

    await request(app.getHttpServer()).get('/api/docs').expect(404);
    await request(app.getHttpServer()).get('/api/docs-json').expect(404);
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
  });
});
