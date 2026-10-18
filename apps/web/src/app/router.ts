import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { NotFound } from './not-found';

/** Routes are files under src/routes (TanStack file-based routing); nothing is registered here. */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree,
    defaultNotFoundComponent: NotFound,
    defaultPreload: 'intent',
    ...(options.history ? { history: options.history } : {}),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter;
  }
}
