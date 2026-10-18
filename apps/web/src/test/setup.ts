import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './msw/server';

// jsdom does not implement scrolling; TanStack Router restores scroll on navigation.
if (typeof window !== 'undefined') window.scrollTo = () => undefined;

// Unhandled requests fail the test: a component must not reach a real network.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
