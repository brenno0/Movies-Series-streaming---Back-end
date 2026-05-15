import { compare } from 'bcryptjs';

import type { User } from 'generated/prisma';

import type { UsersRepository } from '@/infrastructure/database/repositories/users.repository';
import { InvalidCredentialsError } from '@/shared/errors';

interface AuthenticateRequest {
  email: string;
  password: string;
}

export class AuthenticateUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({ email, password }: AuthenticateRequest): Promise<{ user: User }> {
    const user = await this.usersRepository.findByEmail(email);
    if (!user) throw new InvalidCredentialsError();

    const passwordMatches = await compare(password, user.password);
    if (!passwordMatches) throw new InvalidCredentialsError();

    return { user };
  }
}
