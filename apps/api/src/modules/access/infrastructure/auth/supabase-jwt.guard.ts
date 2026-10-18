import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { Env } from '../../../../infrastructure/config/env';
import { ENV } from '../../../../infrastructure/tokens';
import { REGISTER_AUTHENTICATED_USER } from '../../application/register-authenticated-user';
import type { RegisterAuthenticatedUser } from '../../application/register-authenticated-user';
import { PUBLIC_ROUTE_KEY } from '../../application/request-identity';
import type { AuthenticatedRequest } from '../../application/request-identity';
import { JWKS_PROVIDER } from './jwks';
import type { JwksProvider } from './jwks';
import { TokenRejectedError, verifyAccessToken } from './verify-access-token';

const MAX_KNOWN_USERS = 5_000;
const BEARER = /^Bearer\s+(\S+)$/i;

interface HttpRequest extends AuthenticatedRequest {
  readonly headers: Readonly<Record<string, string | string[] | undefined>>;
}

/**
 * Global guard (registered by `AccessModule`): every route needs a valid Supabase access token
 * unless it is marked `@Public()`. Identity only; membership and permissions come with #11.
 */
@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  // userId -> email already mirrored by this process, so only the first request of a user writes.
  private readonly knownUsers = new Map<string, string>();

  constructor(
    private readonly reflector: Reflector,
    private readonly logger: Logger,
    @Inject(ENV) private readonly env: Pick<Env, 'supabaseJwtIssuer'>,
    @Inject(JWKS_PROVIDER) private readonly jwks: JwksProvider,
    @Inject(REGISTER_AUTHENTICATED_USER)
    private readonly registerUser: RegisterAuthenticatedUser,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true;
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(PUBLIC_ROUTE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const token = this.bearerToken(request);
    if (token === undefined) {
      throw this.unauthenticated('MISSING_TOKEN');
    }
    try {
      const user = await verifyAccessToken(token, {
        jwks: this.jwks,
        issuer: this.env.supabaseJwtIssuer,
      });
      await this.mirror(user);
      request.user = user;
      return true;
    } catch (error) {
      if (error instanceof TokenRejectedError) {
        throw this.unauthenticated(error.reason);
      }
      throw error;
    }
  }

  private bearerToken(request: HttpRequest): string | undefined {
    const header = request.headers['authorization'];
    return typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined;
  }

  private async mirror(user: { userId: string; email: string }): Promise<void> {
    if (this.knownUsers.get(user.userId) === user.email) return;
    await this.registerUser(user);
    if (this.knownUsers.size >= MAX_KNOWN_USERS) {
      const oldest = this.knownUsers.keys().next();
      if (!oldest.done) this.knownUsers.delete(oldest.value);
    }
    this.knownUsers.set(user.userId, user.email);
  }

  /** Warn without the token value; `reason` is a jose error code or a fixed label. */
  private unauthenticated(reason: string): UnauthorizedException {
    this.logger.warn({ reason }, 'authentication failed');
    return new UnauthorizedException({
      code: 'UNAUTHENTICATED',
      message: 'A valid access token is required',
    });
  }
}
