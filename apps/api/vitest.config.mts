import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// Nest needs decorator metadata for constructor injection and DTO validation; esbuild does not
// emit it, SWC does (it reads the decorator options from tsconfig.json).
const domainAndApplication = { lines: 80, branches: 80, functions: 80, statements: 80 };

export default defineConfig({
  plugins: [swc.vite()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'scripts/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts'],
      // docs/06-testing-strategy.md section 8
      thresholds: {
        'src/modules/**/domain/**': domainAndApplication,
        'src/modules/**/application/**': domainAndApplication,
      },
    },
  },
});
