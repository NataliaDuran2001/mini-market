import { createParamDecorator } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../application/request-identity';
import type { AuthenticatedUser } from '../domain/identity';

/** The verified `{ userId, email }` of the caller. Only valid on routes behind the JWT guard. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): AuthenticatedUser => {
    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      // Reaching a handler without an identity means @Public() and @CurrentUser() were combined.
      throw new Error('@CurrentUser() used on a route that is not behind the JWT guard');
    }
    return user;
  },
);
