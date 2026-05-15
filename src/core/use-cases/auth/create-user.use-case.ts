import { hash } from 'bcryptjs';

import type { UsersRepository } from '@/infrastructure/database/repositories/users.repository';
import { UserAlreadyExistsError } from '@/shared/errors';

interface CreateUserRequest {
  name: string;
  email: string;
  password: string;
}

export class CreateUserUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({ name, email, password }: CreateUserRequest) {
    const existing = await this.usersRepository.findByEmail(email);
    if (existing) throw new UserAlreadyExistsError();

    const passwordHash = await hash(password, 6);
    const user = await this.usersRepository.create({ name, email, password: passwordHash });
    return { user };
  }
}
