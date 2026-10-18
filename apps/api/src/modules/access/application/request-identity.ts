import type { AuthenticatedUser } from '../domain/identity';

export type { AuthenticatedUser };

// These two are HTTP details that live in `application` only because the boundary rules let both
// the guard (infrastructure) and the decorators (presentation) import from there, and nothing else
// they share. They carry no framework types.

/** Route metadata set by `@Public()` and read by the JWT guard. */
export const PUBLIC_ROUTE_KEY = 'mini-market:public-route';

/** The guard stores the verified identity on the request; `@CurrentUser()` reads it back. */
export interface AuthenticatedRequest {
  user?: AuthenticatedUser;
}
