import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const isTest = process.env['VITEST'] !== undefined;

export default defineConfig(({ mode }) => {
  // The dev server port comes from WEB_PORT (shell or apps/web/.env) so parallel lanes can run
  // side by side; default 5173.
  const fileEnv = loadEnv(mode, import.meta.dirname, '');
  const webPort = Number(process.env['WEB_PORT'] ?? fileEnv['WEB_PORT'] ?? 5173);

  return {
    plugins: [
      // Route files live in src/routes (file-based). The tree is generated and not committed.
      ...(isTest ? [] : [tanstackRouter({ target: 'react', autoCodeSplitting: true })]),
      react(),
      ...(isTest ? [] : [tailwindcss()]),
    ],
    resolve: {
      alias: { '@': path.resolve(import.meta.dirname, 'src') },
    },
    server: { port: webPort, strictPort: true },
    preview: { port: webPort, strictPort: true },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      env: {
        VITE_API_URL: 'http://api.test',
        VITE_SUPABASE_URL: 'http://supabase.test',
        VITE_SUPABASE_ANON_KEY: 'test-anon-key',
      },
    },
  };
});
