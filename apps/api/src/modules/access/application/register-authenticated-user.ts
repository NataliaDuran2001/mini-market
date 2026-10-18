import type { WithTransaction } from '../../../infrastructure/db/with-transaction';
import type { AuthenticatedUser } from '../domain/identity';
import type { UserRepository } from './ports/user.repository';

export const REGISTER_AUTHENTICATED_USER = Symbol('REGISTER_AUTHENTICATED_USER');

export type RegisterAuthenticatedUser = (user: AuthenticatedUser) => Promise<void>;

export interface RegisterAuthenticatedUserDeps {
  readonly users: UserRepository;
  readonly withTransaction: WithTransaction;
}

/** Keeps the `users` mirror in step with Supabase Auth on the first request of each user. */
export async function registerAuthenticatedUser(
  deps: RegisterAuthenticatedUserDeps,
  user: AuthenticatedUser,
): Promise<void> {
  await deps.withTransaction(null, (tx) => deps.users.upsert(tx, user));
}
