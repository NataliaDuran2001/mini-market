import type { RequestHandler } from 'msw';
import { setupServer } from 'msw/node';

// Handlers live in ./handlers/<feature>.ts and export `handlers`. A glob collects them, so lanes
// adding a feature add a file and never edit a shared list.
const modules = import.meta.glob<{ handlers: RequestHandler[] }>('./handlers/*.ts', {
  eager: true,
});

export const defaultHandlers: RequestHandler[] = Object.values(modules).flatMap(
  (module) => module.handlers,
);

export const server = setupServer(...defaultHandlers);
