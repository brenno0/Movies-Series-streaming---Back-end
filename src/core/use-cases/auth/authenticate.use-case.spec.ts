import { hash } from 'bcryptjs';
import { describe, it, expect, beforeEach } from 'vitest';
import type { User } from 'generated/prisma';

import type { UsersRepository } from '@/infrastructure/database/repositories/users.repository';
import { InvalidCredentialsError } from '@/shared/errors';
import { AuthenticateUseCase } from './authenticate.use-case';

function makeInMemoryUsersRepo(): UsersRepository {
  const users: User[] = [];
  return {
    async create(data) {
      const user = { preferences: null, ...data, id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date() } as User;
      users.push(user);
      return user;
    },
    async getUserById(id) { return users.find((u) => u.id === id) ?? null; },
    async findByEmail(email) { return users.find((u) => u.email === email) ?? null; },
  };
}

describe('AuthenticateUseCase', () => {
  let sut: AuthenticateUseCase;
  let repo: UsersRepository;

  beforeEach(async () => {
    repo = makeInMemoryUsersRepo();
    sut = new AuthenticateUseCase(repo);
    await repo.create({ name: 'Alice', email: 'alice@test.com', password: await hash('123456', 6) });
  });

  it('returns user on valid credentials', async () => {
    const { user } = await sut.execute({ email: 'alice@test.com', password: '123456' });
    expect(user.email).toBe('alice@test.com');
  });

  it('throws on wrong password', async () => {
    await expect(sut.execute({ email: 'alice@test.com', password: 'wrong' }))
      .rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('throws on unknown email', async () => {
    await expect(sut.execute({ email: 'nobody@test.com', password: '123456' }))
      .rejects.toBeInstanceOf(InvalidCredentialsError);
  });
});
