import type { AuthenticatedUser } from '../domain/identity';

export type { AuthenticatedUser };

/** Route metadata set by `@Public()` and read by the JWT guard. */
export const PUBLIC_ROUTE_KEY = 'mini-market:public-route';

/** The guard stores the verified identity on the request; `@CurrentUser()` reads it back. */
export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}
