import type { UsersRepository } from '@/infrastructure/database/repositories/users.repository';
import { ResourceNotFoundError } from '@/shared/errors';

export class GetUserUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({ userId }: { userId: string }) {
    const user = await this.usersRepository.getUserById(userId);
    if (!user) throw new ResourceNotFoundError({ resource: 'User' });

    const { password: _, ...userWithoutPassword } = user;
    return { user: userWithoutPassword };
  }
}
