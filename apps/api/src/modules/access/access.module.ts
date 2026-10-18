import type { Clock } from '@mini-market/shared-kernel';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { Env } from '../../infrastructure/config/env';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { CLOCK, ENV, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { INVITE_MEMBER, inviteMember } from './application/invite-member';
import type {
  InviteMemberActor,
  InviteMemberDeps,
  InviteMemberInput,
} from './application/invite-member';
import type { InvitationRepository } from './application/ports/invitation.repository';
import type { InvitationTokenPort } from './application/ports/invitation-token.port';
import type { MembershipDirectory } from './application/ports/membership-directory.port';
import type { SupabaseAdminPort } from './application/ports/supabase-admin.port';
import type { UserRepository } from './application/ports/user.repository';
import {
  REGISTER_AUTHENTICATED_USER,
  registerAuthenticatedUser,
} from './application/register-authenticated-user';
import {
  INVITATION_REPOSITORY,
  INVITATION_TOKENS,
  MEMBERSHIP_DIRECTORY,
  SUPABASE_ADMIN,
  USER_REPOSITORY,
} from './application/tokens';
import type { AuthenticatedUser } from './domain/identity';
import { JWKS_PROVIDER, createRemoteJwksProvider } from './infrastructure/auth/jwks';
import { SupabaseJwtGuard } from './infrastructure/auth/supabase-jwt.guard';
import { CryptoInvitationTokens } from './infrastructure/crypto-invitation-tokens';
import { DrizzleInvitationRepository } from './infrastructure/drizzle-invitation.repository';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository';
import { FailClosedMembershipDirectory } from './infrastructure/fail-closed-membership-directory';
import { SupabaseAdminClient } from './infrastructure/supabase-admin.client';
import { AuthController } from './presentation/auth.controller';
import { MeController } from './presentation/me.controller';

@Module({
  controllers: [AuthController, MeController],
  providers: [
    { provide: APP_GUARD, useClass: SupabaseJwtGuard },
    {
      provide: JWKS_PROVIDER,
      useFactory: (env: Env) => createRemoteJwksProvider(env.supabaseUrl),
      inject: [ENV],
    },
    { provide: USER_REPOSITORY, useFactory: () => new DrizzleUserRepository() },
    { provide: INVITATION_REPOSITORY, useFactory: () => new DrizzleInvitationRepository() },
    { provide: INVITATION_TOKENS, useFactory: () => new CryptoInvitationTokens() },
    // Replaced by the memberships table in issue #11; fails closed until then.
    { provide: MEMBERSHIP_DIRECTORY, useFactory: () => new FailClosedMembershipDirectory() },
    {
      provide: SUPABASE_ADMIN,
      useFactory: (env: Env) =>
        new SupabaseAdminClient({
          supabaseUrl: env.supabaseUrl,
          serviceRoleKey: env.supabaseServiceRoleKey,
        }),
      inject: [ENV],
    },
    {
      provide: REGISTER_AUTHENTICATED_USER,
      useFactory:
        (users: UserRepository, withTransaction: WithTransaction) => (user: AuthenticatedUser) =>
          registerAuthenticatedUser({ users, withTransaction }, user),
      inject: [USER_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: INVITE_MEMBER,
      useFactory: (
        env: Env,
        clock: Clock,
        invitations: InvitationRepository,
        memberships: MembershipDirectory,
        supabaseAdmin: SupabaseAdminPort,
        tokens: InvitationTokenPort,
        withTransaction: WithTransaction,
      ) => {
        const deps: InviteMemberDeps = {
          clock,
          invitations,
          memberships,
          supabaseAdmin,
          tokens,
          withTransaction,
          acceptInvitationUrl: new URL('/accept-invitation', env.webOrigin).toString(),
        };
        return (actor: InviteMemberActor, input: InviteMemberInput) =>
          inviteMember(deps, actor, input);
      },
      inject: [
        ENV,
        CLOCK,
        INVITATION_REPOSITORY,
        MEMBERSHIP_DIRECTORY,
        SUPABASE_ADMIN,
        INVITATION_TOKENS,
        WITH_TRANSACTION,
      ],
    },
  ],
})
export class AccessModule {}
