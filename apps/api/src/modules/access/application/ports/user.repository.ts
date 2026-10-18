import type { Transaction } from '../../../../infrastructure/db/database';
import type { AuthenticatedUser } from '../../domain/identity';

/** Mirror of the Supabase auth users the API has seen (table `users`). */
export interface UserRepository {
  /** Inserts the user or refreshes its email; safe to call on every request. */
  upsert(tx: Transaction, user: AuthenticatedUser): Promise<void>;
}
