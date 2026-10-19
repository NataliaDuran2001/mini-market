import {
  inviteMemberRequestSchema,
  updateMemberRequestSchema,
  type Invitation,
  type InviteMemberResponse,
  type Member,
} from '@mini-market/contracts/access';
import { http, HttpResponse, type RequestHandler } from 'msw';
import { apiUrl } from '../api-url';

let nextId = 1;
const nextUuid = () => `00000000-0000-4000-8000-${String(nextId++).padStart(12, '0')}`;

/** A valid member of the contract; typed with `Member`, so a contract change breaks the mocks. */
export function aMember(overrides: Partial<Member> = {}): Member {
  const userId = nextUuid();
  return {
    userId,
    email: `empleado${userId.slice(-4)}@example.com`,
    role: 'employee',
    status: 'active',
    ...overrides,
  };
}

export function anInvitation(overrides: Partial<Invitation> = {}): Invitation {
  return {
    id: nextUuid(),
    email: `invitado${nextId}@example.com`,
    role: 'employee',
    invitedAt: '2026-10-15T14:00:00.000Z',
    expiresAt: '2026-10-22T14:00:00.000Z',
    status: 'pending',
    ...overrides,
  };
}

/**
 * In-memory members and invitations backend with the rules of the real one: an invitation adds a
 * pending row, `PATCH` switches the status. `members` and `invitations` are the live lists, so a
 * test can read what the screen caused.
 */
export function teamApi(initial: {
  readonly members?: readonly Member[];
  readonly invitations?: readonly Invitation[];
}) {
  const members: Member[] = [...(initial.members ?? [])];
  const invitations: Invitation[] = [...(initial.invitations ?? [])];
  const handlers: RequestHandler[] = [
    http.get(apiUrl('/members'), () => HttpResponse.json({ items: members })),
    http.get(apiUrl('/invitations'), () => HttpResponse.json({ items: invitations })),
    http.post(apiUrl('/auth/invitations'), async ({ request }) => {
      const body = inviteMemberRequestSchema.parse(await request.json());
      const created = anInvitation({ email: body.email });
      invitations.unshift(created);
      return HttpResponse.json(
        {
          invitationId: created.id,
          email: created.email,
          role: created.role,
          expiresAt: created.expiresAt,
        } satisfies InviteMemberResponse,
        { status: 202 },
      );
    }),
    http.patch(apiUrl('/members/:userId'), async ({ request, params }) => {
      const body = updateMemberRequestSchema.parse(await request.json());
      const index = members.findIndex((member) => member.userId === params['userId']);
      const found = members[index];
      if (!found) {
        return HttpResponse.json(
          { code: 'MEMBER_NOT_FOUND', message: 'Member not found' },
          { status: 404 },
        );
      }
      const updated: Member = body.status ? { ...found, status: body.status } : found;
      members[index] = updated;
      return HttpResponse.json(updated);
    }),
  ];
  return { members, invitations, handlers };
}

// Default: a business with no one to list (read only, so no test leaks state into the next). Tests
// use server.use(...teamApi({ ... }).handlers).
export const handlers: RequestHandler[] = [
  http.get(apiUrl('/members'), () => HttpResponse.json({ items: [] })),
  http.get(apiUrl('/invitations'), () => HttpResponse.json({ items: [] })),
];
