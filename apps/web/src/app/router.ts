import { createRouter, type RouterHistory } from '@tanstack/react-router';
import { routeTree } from '@/routeTree.gen';
import { NotFound } from './not-found';
import type { RouterContext } from './router-context';

/** Routes are files under src/routes (TanStack file-based routing); nothing is registered here. */
export function createAppRouter(options: { context: RouterContext; history?: RouterHistory }) {
  return createRouter({
    routeTree,
    context: options.context,
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
