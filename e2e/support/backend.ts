// Talks to the e2e backend (apps/api/test/e2e): the seeded tenants, tokens minted by the fake
// Supabase, and direct API calls. Only for arranging data and for checks that have no screen yet.
const apiPort = Number(process.env['API_PORT'] ?? 3001);
const supabasePort = Number(process.env['E2E_SUPABASE_PORT'] ?? apiPort + 2000);
const supabaseUrl = `http://localhost:${supabasePort}`;
const apiUrl = `http://localhost:${apiPort}/api/v1`;

/** Base URL of the API, `/api/v1` included. */
export const apiBaseUrl = (): string => apiUrl;

export interface SeededTenant {
  readonly name: string;
  readonly slug: string;
  readonly preset: 'minimarket' | 'farmacia';
  readonly ownerEmail: string;
  readonly employeeEmail: string;
  readonly tenantId: string;
}

export interface Seed {
  readonly password: string;
  readonly tenants: { readonly a: SeededTenant; readonly b: SeededTenant };
}

interface RecordedInvite {
  readonly email: string;
  readonly token: string | null;
}

export async function loadSeed(): Promise<Seed> {
  const response = await fetch(`${supabaseUrl}/__e2e/seed`);
  if (!response.ok) throw new Error(`e2e seed not available (${response.status})`);
  return (await response.json()) as Seed; // as: the backend answers the Seed shape
}

export async function tokenFor(email: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/__e2e/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(`no token for ${email} (${response.status})`);
  return ((await response.json()) as { accessToken: string }).accessToken; // as: backend contract
}

export interface ApiResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** Calls the API as `as` (a seeded or invited user). `tenantId` becomes `X-Tenant-Id`. */
export async function callApi(options: {
  readonly as: string;
  readonly path: string;
  readonly method?: string;
  readonly tenantId?: string;
  readonly body?: unknown;
}): Promise<ApiResult> {
  const response = await fetch(`${apiUrl}${options.path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${await tokenFor(options.as)}`,
      ...(options.tenantId ? { 'X-Tenant-Id': options.tenantId } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>; // as: JSON object or empty
  return { status: response.status, body };
}

async function invitationTokenFor(email: string): Promise<string> {
  const response = await fetch(`${supabaseUrl}/__e2e/invites`);
  const { invites } = (await response.json()) as { invites: RecordedInvite[] };
  const token = invites.findLast((invite) => invite.email === email)?.token;
  if (!token) throw new Error(`no invitation recorded for ${email}`);
  return token;
}

/** The owner invites `email` as an employee. Returns the application invitation token. */
export async function inviteEmployee(tenant: SeededTenant, email: string): Promise<string> {
  const result = await callApi({
    as: tenant.ownerEmail,
    path: '/auth/invitations',
    method: 'POST',
    tenantId: tenant.tenantId,
    body: { email, role: 'employee' },
  });
  if (result.status !== 202) throw new Error(`invitation failed with ${result.status}`);
  return invitationTokenFor(email);
}

/** Invites and accepts through the API, for specs that need an employee as a starting point. */
export async function createEmployee(tenant: SeededTenant, email: string): Promise<void> {
  const token = await inviteEmployee(tenant, email);
  const accepted = await callApi({
    as: email,
    path: '/invitations/accept',
    method: 'POST',
    body: { token },
  });
  if (accepted.status !== 200)
    throw new Error(`accepting the invitation failed (${accepted.status})`);
}

/** Link of the invitation email: the app token in the query, a signed-in session in the hash. */
export async function invitationLink(email: string, token: string): Promise<string> {
  const accessToken = await tokenFor(email);
  const hash = new URLSearchParams({
    access_token: accessToken,
    refresh_token: 'e2e-refresh-token',
    expires_in: '3600',
    token_type: 'bearer',
    type: 'invite',
  });
  return `/accept-invitation?token=${encodeURIComponent(token)}#${hash.toString()}`;
}

let counter = 0;
/** An email that no other spec (or project run) used. */
export function uniqueEmail(label: string): string {
  counter += 1;
  return `${label}.${Date.now()}.${counter}@example.com`;
}
