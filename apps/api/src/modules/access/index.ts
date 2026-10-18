// Public API of the access module. Other modules import only from here.
export { INVITE_MEMBER } from './application/invite-member';
export type {
  InviteMember,
  InviteMemberActor,
  InviteMemberInput,
} from './application/invite-member';
export { PUBLIC_ROUTE_KEY } from './application/request-identity';
export type { AuthenticatedRequest } from './application/request-identity';
export { NotAMemberError } from './domain/errors';
export type { AuthenticatedUser, Role } from './domain/identity';
export { AccessModule } from './access.module';
export { CurrentUser } from './presentation/current-user.decorator';
export { Public } from './presentation/public.decorator';
export { invitations, users } from './infrastructure/schema';
