import { defineConfig } from 'drizzle-kit';

// Migrations are named with a timestamp prefix, never a sequential number, so two lanes that add
// a migration at the same time do not collide (parallel-lane convention of issue #3).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infrastructure/db/schema.ts',
  out: './drizzle',
  casing: 'snake_case',
  migrations: { prefix: 'timestamp' },
  dbCredentials: { url: process.env['DATABASE_URL'] ?? '' },
});
