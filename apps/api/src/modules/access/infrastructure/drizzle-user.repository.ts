import type { Transaction } from '../../../infrastructure/db/database';
import type { UserRepository } from '../application/ports/user.repository';
import type { AuthenticatedUser } from '../domain/identity';
import { users } from './schema';

export class DrizzleUserRepository implements UserRepository {
  async upsert(tx: Transaction, user: AuthenticatedUser): Promise<void> {
    await tx
      .insert(users)
      .values({ id: user.userId, email: user.email })
      .onConflictDoUpdate({ target: users.id, set: { email: user.email } });
  }
}
