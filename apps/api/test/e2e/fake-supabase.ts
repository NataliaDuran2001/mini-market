// A small stand-in for Supabase Auth (GoTrue) used only by the end-to-end suite (docs/06 section 7,
// issue #16). It serves the JWKS the API verifies tokens against, the endpoints supabase-js calls in
// the browser (password login, refresh, user, logout, recovery) and the admin endpoints the API and
// the provisioning script call (invite, user list), plus a few `/__e2e/*` helpers for the tests.
// It lives under test/ and is never part of a production build. Nothing here is a real credential.
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { JWK } from 'jose';

const KID = 'e2e-key';
const TOKEN_TTL_SECONDS = 3600;

export interface FakeUser {
  readonly id: string;
  readonly email: string;
  password: string;
}

export interface RecordedInvite {
  readonly email: string;
  readonly redirectTo: string;
  /** `token` query parameter of the redirect: the application invitation token. */
  readonly token: string | null;
}

export interface FakeSupabaseOptions {
  readonly port: number;
  readonly serviceRoleKey: string;
  /** Password given to every invited user, so the suite can sign in without an email round trip. */
  readonly defaultPassword: string;
  /** Called with `GET /__e2e/seed`; the launcher fills it once seeding is done. */
  readonly seedSummary: () => unknown | undefined;
}

export interface FakeSupabase {
  readonly url: string;
  readonly issuer: string;
  readonly invites: readonly RecordedInvite[];
  signAccessToken(email: string): Promise<string>;
  close(): Promise<void>;
}

type Json = Record<string, unknown>;

async function readJson(request: IncomingMessage): Promise<Json> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(chunk as Buffer);
  const text = Buffer.concat(chunks).toString('utf8');
  if (!text) return {};
  try {
    return JSON.parse(text) as Json; // as: bodies of this fake are always JSON objects
  } catch {
    return {};
  }
}

function send(response: ServerResponse, status: number, body?: unknown): void {
  if (body === undefined) {
    response.writeHead(status).end();
    return;
  }
  response.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(body));
}

const gotrueError = (status: number, code: string, message: string): Json => ({
  code: status,
  error_code: code,
  msg: message,
});

function userJson(user: FakeUser): Json {
  return {
    id: user.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: user.email,
    email_confirmed_at: '2026-01-01T00:00:00Z',
    app_metadata: { provider: 'email' },
    user_metadata: {},
    created_at: '2026-01-01T00:00:00Z',
  };
}

export async function startFakeSupabase(options: FakeSupabaseOptions): Promise<FakeSupabase> {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const publicJwk: JWK = { ...(await exportJWK(publicKey)), kid: KID, alg: 'ES256', use: 'sig' };
  const url = `http://localhost:${options.port}`;
  const issuer = `${url}/auth/v1`;
  const users = new Map<string, FakeUser>();
  const refreshTokens = new Map<string, string>();
  const invites: RecordedInvite[] = [];

  const signAccessToken = (email: string): Promise<string> => {
    const user = users.get(email);
    if (!user) throw new Error(`unknown e2e user ${email}`);
    return new SignJWT({ email: user.email })
      .setProtectedHeader({ alg: 'ES256', kid: KID })
      .setSubject(user.id)
      .setIssuer(issuer)
      .setAudience('authenticated')
      .setIssuedAt()
      .setExpirationTime(Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS)
      .sign(privateKey);
  };

  async function session(user: FakeUser): Promise<Json> {
    const refreshToken = randomUUID();
    refreshTokens.set(refreshToken, user.email);
    return {
      access_token: await signAccessToken(user.email),
      token_type: 'bearer',
      expires_in: TOKEN_TTL_SECONDS,
      expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      user: userJson(user),
    };
  }

  const userFromBearer = (request: IncomingMessage): FakeUser | undefined => {
    const header = request.headers.authorization ?? '';
    const token = header.replace(/^Bearer /, '');
    const payload = token.split('.')[1];
    if (!payload) return undefined;
    try {
      const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
        email?: string;
      };
      return claims.email ? users.get(claims.email) : undefined;
    } catch {
      return undefined;
    }
  };

  const isAdmin = (request: IncomingMessage): boolean =>
    request.headers.apikey === options.serviceRoleKey;

  async function handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const origin = request.headers.origin;
    response.setHeader('Access-Control-Allow-Origin', origin ?? '*');
    response.setHeader('Access-Control-Allow-Headers', '*');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    if (request.method === 'OPTIONS') return send(response, 204);

    const target = new URL(request.url ?? '/', url);
    const route = `${request.method} ${target.pathname}`;

    switch (route) {
      case 'GET /__e2e/ready': {
        const summary = options.seedSummary();
        return summary === undefined ? send(response, 503) : send(response, 200, { ready: true });
      }
      case 'GET /__e2e/seed':
        return send(response, 200, options.seedSummary() ?? {});
      case 'GET /__e2e/invites':
        return send(response, 200, { invites });
      case 'POST /__e2e/token': {
        const { email } = await readJson(request);
        return typeof email === 'string' && users.has(email)
          ? send(response, 200, { accessToken: await signAccessToken(email) })
          : send(response, 404, gotrueError(404, 'user_not_found', 'Unknown user'));
      }
      case 'GET /auth/v1/.well-known/jwks.json':
        return send(response, 200, { keys: [publicJwk] });
      case 'POST /auth/v1/token': {
        const body = await readJson(request);
        const grant = target.searchParams.get('grant_type');
        if (grant === 'refresh_token') {
          const email = refreshTokens.get(String(body['refresh_token']));
          const user = email ? users.get(email) : undefined;
          return user
            ? send(response, 200, await session(user))
            : send(response, 400, gotrueError(400, 'refresh_token_not_found', 'Invalid token'));
        }
        const user = users.get(String(body['email']).toLowerCase());
        return user && user.password === body['password']
          ? send(response, 200, await session(user))
          : send(
              response,
              400,
              gotrueError(400, 'invalid_credentials', 'Invalid login credentials'),
            );
      }
      case 'GET /auth/v1/user': {
        const user = userFromBearer(request);
        return user
          ? send(response, 200, userJson(user))
          : send(response, 401, gotrueError(401, 'bad_jwt', 'Invalid JWT'));
      }
      case 'PUT /auth/v1/user': {
        const user = userFromBearer(request);
        if (!user) return send(response, 401, gotrueError(401, 'bad_jwt', 'Invalid JWT'));
        const { password } = await readJson(request);
        if (typeof password === 'string') user.password = password;
        return send(response, 200, userJson(user));
      }
      case 'POST /auth/v1/logout':
        return send(response, 204);
      case 'POST /auth/v1/recover':
        return send(response, 200, {});
      case 'POST /auth/v1/invite': {
        if (!isAdmin(request))
          return send(response, 401, gotrueError(401, 'no_authorization', 'Admin only'));
        const { email } = await readJson(request);
        if (typeof email !== 'string')
          return send(response, 400, gotrueError(400, 'validation_failed', 'email'));
        const redirectTo = target.searchParams.get('redirect_to') ?? '';
        const normalized = email.toLowerCase();
        if (users.has(normalized)) {
          return send(
            response,
            422,
            gotrueError(422, 'email_exists', 'A user with this email already exists'),
          );
        }
        const user: FakeUser = {
          id: randomUUID(),
          email: normalized,
          password: options.defaultPassword,
        };
        users.set(normalized, user);
        const token = URL.canParse(redirectTo)
          ? new URL(redirectTo).searchParams.get('token')
          : null;
        invites.push({ email: normalized, redirectTo, token });
        return send(response, 200, userJson(user));
      }
      case 'GET /auth/v1/admin/users': {
        if (!isAdmin(request))
          return send(response, 401, gotrueError(401, 'no_authorization', 'Admin only'));
        return send(response, 200, { users: [...users.values()].map(userJson) });
      }
      default:
        return send(response, 404, gotrueError(404, 'not_found', route));
    }
  }

  const server: Server = createServer((request, response) => {
    handle(request, response).catch((error: unknown) => {
      send(response, 500, gotrueError(500, 'unexpected_failure', String(error)));
    });
  });
  await new Promise<void>((resolve) => server.listen(options.port, resolve));

  return {
    url,
    issuer,
    invites,
    signAccessToken,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
