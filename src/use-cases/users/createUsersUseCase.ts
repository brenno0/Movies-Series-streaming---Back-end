import { hash } from 'bcryptjs';

import type { UsersRepository } from '@/repositories/users-repository';

import { UserAlreadyExistsError } from '../errors/userAlreadyExists';

interface CreateUsersUseCaseRequest {
  name: string;
  email: string;
  password: string;
}

export class CreateUsersUseCase {
  constructor(private readonly usersRepository: UsersRepository) {}

  async execute({ name, email, password }: CreateUsersUseCaseRequest) {
    const userAlreadyExists = await this.usersRepository.findByEmail(email);

    if (userAlreadyExists) {
      throw new UserAlreadyExistsError();
    }

    const password_hash = await hash(password, 6);

    const user = await this.usersRepository.create({
      name,
      email,
      password: password_hash,
    });
    return { user };
  }
}
