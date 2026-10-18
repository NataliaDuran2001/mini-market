import type { Clock } from '@mini-market/shared-kernel';
import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { Env } from '../../infrastructure/config/env';
import type { WithTransaction } from '../../infrastructure/db/with-transaction';
import { describeError } from '../../infrastructure/logger/describe-error';
import { CLOCK, ENV, WITH_TRANSACTION } from '../../infrastructure/tokens';
import { GET_TENANT_SETTINGS, TenancyModule } from '../tenancy';
import type { GetTenantSettings } from '../tenancy';
import { ACCESS_PERMISSIONS, permissionsProvider } from './access.permissions';
import { ACCEPT_INVITATION, acceptInvitation } from './application/accept-invitation';
import { CHANGE_MEMBER_ROLE, changeMemberRole } from './application/change-member-role';
import { DISABLE_MEMBER, disableMember } from './application/disable-member';
import { INVITE_MEMBER, inviteMember } from './application/invite-member';
import type { InviteMemberDeps } from './application/invite-member';
import { LIST_MEMBERS, listMembers } from './application/list-members';
import { LIST_MY_TENANTS, listMyTenants } from './application/list-my-tenants';
import { PERMISSION_REGISTRY, PermissionRegistry } from './application/permission-registry';
import { AUDIT_PORT } from './application/ports/audit.port';
import type { AuditPort } from './application/ports/audit.port';
import type { InvitationRepository } from './application/ports/invitation.repository';
import type { InvitationTokenPort } from './application/ports/invitation-token.port';
import type { MembershipRepository } from './application/ports/membership.repository';
import type { SupabaseAdminPort } from './application/ports/supabase-admin.port';
import type { TenantSettingsSource } from './application/ports/tenant-settings-source.port';
import type { UserRepository } from './application/ports/user.repository';
import {
  REGISTER_AUTHENTICATED_USER,
  registerAuthenticatedUser,
} from './application/register-authenticated-user';
import { RESOLVE_TENANT_CONTEXT, resolveTenantContext } from './application/resolve-tenant-context';
import {
  INVITATION_REPOSITORY,
  INVITATION_TOKENS,
  MEMBERSHIP_REPOSITORY,
  SUPABASE_ADMIN,
  TENANT_SETTINGS_SOURCE,
  USER_REPOSITORY,
} from './application/tokens';
import { JWKS_PROVIDER, createRemoteJwksProvider } from './infrastructure/auth/jwks';
import { PermissionGuard } from './infrastructure/auth/permission.guard';
import { SupabaseJwtGuard } from './infrastructure/auth/supabase-jwt.guard';
import { TenantGuard } from './infrastructure/auth/tenant.guard';
import { CryptoInvitationTokens } from './infrastructure/crypto-invitation-tokens';
import { DrizzleAuditRepository } from './infrastructure/drizzle-audit.repository';
import { DrizzleInvitationRepository } from './infrastructure/drizzle-invitation.repository';
import { DrizzleMembershipRepository } from './infrastructure/drizzle-membership.repository';
import { DrizzleUserRepository } from './infrastructure/drizzle-user.repository';
import { SupabaseAdminClient } from './infrastructure/supabase-admin.client';
import { TenancySettingsSource } from './infrastructure/tenancy-settings.source';
import { AuthController } from './presentation/auth.controller';
import { InvitationsController } from './presentation/invitations.controller';
import { MeController } from './presentation/me.controller';
import { MembersController } from './presentation/members.controller';

/**
 * Global so any module can inject the permission registry (`permissionsProvider`) and the audit
 * port without importing this module. Guards run in this order: JWT, tenant, permission.
 */
@Global()
@Module({
  imports: [TenancyModule],
  controllers: [AuthController, InvitationsController, MeController, MembersController],
  providers: [
    { provide: APP_GUARD, useClass: SupabaseJwtGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
    { provide: PERMISSION_REGISTRY, useFactory: () => new PermissionRegistry() },
    permissionsProvider('access', ACCESS_PERMISSIONS),
    {
      provide: JWKS_PROVIDER,
      useFactory: (env: Env) => createRemoteJwksProvider(env.supabaseUrl),
      inject: [ENV],
    },
    { provide: USER_REPOSITORY, useFactory: () => new DrizzleUserRepository() },
    { provide: MEMBERSHIP_REPOSITORY, useFactory: () => new DrizzleMembershipRepository() },
    { provide: INVITATION_REPOSITORY, useFactory: () => new DrizzleInvitationRepository() },
    { provide: INVITATION_TOKENS, useFactory: () => new CryptoInvitationTokens() },
    { provide: AUDIT_PORT, useFactory: () => new DrizzleAuditRepository() },
    {
      provide: TENANT_SETTINGS_SOURCE,
      useFactory: (getTenantSettings: GetTenantSettings) =>
        new TenancySettingsSource(getTenantSettings),
      inject: [GET_TENANT_SETTINGS],
    },
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
      useFactory: (users: UserRepository, withTransaction: WithTransaction) =>
        registerAuthenticatedUser.bind(null, { users, withTransaction }),
      inject: [USER_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: RESOLVE_TENANT_CONTEXT,
      useFactory: (
        memberships: MembershipRepository,
        settings: TenantSettingsSource,
        registry: PermissionRegistry,
        withTransaction: WithTransaction,
      ) => resolveTenantContext.bind(null, { memberships, settings, registry, withTransaction }),
      inject: [
        MEMBERSHIP_REPOSITORY,
        TENANT_SETTINGS_SOURCE,
        PERMISSION_REGISTRY,
        WITH_TRANSACTION,
      ],
    },
    {
      provide: LIST_MEMBERS,
      useFactory: (memberships: MembershipRepository, withTransaction: WithTransaction) =>
        listMembers.bind(null, { memberships, withTransaction }),
      inject: [MEMBERSHIP_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: CHANGE_MEMBER_ROLE,
      useFactory: (
        memberships: MembershipRepository,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => changeMemberRole.bind(null, { memberships, audit, clock, withTransaction }),
      inject: [MEMBERSHIP_REPOSITORY, AUDIT_PORT, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: DISABLE_MEMBER,
      useFactory: (
        memberships: MembershipRepository,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) => disableMember.bind(null, { memberships, audit, clock, withTransaction }),
      inject: [MEMBERSHIP_REPOSITORY, AUDIT_PORT, CLOCK, WITH_TRANSACTION],
    },
    {
      provide: ACCEPT_INVITATION,
      useFactory: (
        invitations: InvitationRepository,
        memberships: MembershipRepository,
        tokens: InvitationTokenPort,
        audit: AuditPort,
        clock: Clock,
        withTransaction: WithTransaction,
      ) =>
        acceptInvitation.bind(null, {
          invitations,
          memberships,
          tokens,
          audit,
          clock,
          withTransaction,
        }),
      inject: [
        INVITATION_REPOSITORY,
        MEMBERSHIP_REPOSITORY,
        INVITATION_TOKENS,
        AUDIT_PORT,
        CLOCK,
        WITH_TRANSACTION,
      ],
    },
    {
      provide: LIST_MY_TENANTS,
      useFactory: (memberships: MembershipRepository, withTransaction: WithTransaction) =>
        listMyTenants.bind(null, { memberships, withTransaction }),
      inject: [MEMBERSHIP_REPOSITORY, WITH_TRANSACTION],
    },
    {
      provide: INVITE_MEMBER,
      useFactory: (
        env: Env,
        clock: Clock,
        invitations: InvitationRepository,
        supabaseAdmin: SupabaseAdminPort,
        tokens: InvitationTokenPort,
        logger: Logger,
        withTransaction: WithTransaction,
      ) => {
        const deps: InviteMemberDeps = {
          clock,
          invitations,
          supabaseAdmin,
          tokens,
          withTransaction,
          reportFailure: (error) =>
            logger.error({ error: describeError(error) }, 'invitation email failed'),
          acceptInvitationUrl: new URL('/accept-invitation', env.webOrigin).toString(),
        };
        return inviteMember.bind(null, deps);
      },
      inject: [
        ENV,
        CLOCK,
        INVITATION_REPOSITORY,
        SUPABASE_ADMIN,
        INVITATION_TOKENS,
        Logger,
        WITH_TRANSACTION,
      ],
    },
  ],
  exports: [AUDIT_PORT, PERMISSION_REGISTRY],
})
export class AccessModule {}
