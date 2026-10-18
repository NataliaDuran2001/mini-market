import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text-summary', 'json-summary', 'lcov'],
      // docs/06-testing-strategy.md section 8 sets 90%; issue #5 expects 100% for the kernel.
      thresholds: { lines: 100, branches: 100, functions: 100, statements: 100 },
    },
  },
});
