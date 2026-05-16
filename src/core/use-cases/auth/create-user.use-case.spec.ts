import { hash } from 'bcryptjs';
import { describe, it, expect, beforeEach } from 'vitest';

import type { UsersRepository } from '@/infrastructure/database/repositories/users.repository';
import { UserAlreadyExistsError } from '@/shared/errors';
import { CreateUserUseCase } from './create-user.use-case';

function makeInMemoryUsersRepo(): UsersRepository {
  const users: Awaited<ReturnType<UsersRepository['create']>>[] = [];
  return {
    async create(data) {
      const user = { id: crypto.randomUUID(), createdAt: new Date(), updatedAt: new Date(), preferences: null, ...data };
      users.push(user);
      return user;
    },
    async getUserById(id) { return users.find((u) => u.id === id) ?? null; },
    async findByEmail(email) { return users.find((u) => u.email === email) ?? null; },
  };
}

describe('CreateUserUseCase', () => {
  let sut: CreateUserUseCase;

  beforeEach(() => {
    sut = new CreateUserUseCase(makeInMemoryUsersRepo());
  });

  it('creates a user', async () => {
    const { user } = await sut.execute({ name: 'Alice', email: 'alice@test.com', password: '123456' });
    expect(user.id).toBeDefined();
    expect(user.email).toBe('alice@test.com');
  });

  it('hashes password', async () => {
    const { user } = await sut.execute({ name: 'Alice', email: 'alice@test.com', password: '123456' });
    expect(user.password).not.toBe('123456');
  });

  it('throws if email already taken', async () => {
    const repo = makeInMemoryUsersRepo();
    sut = new CreateUserUseCase(repo);
    await sut.execute({ name: 'Alice', email: 'alice@test.com', password: '123456' });
    await expect(sut.execute({ name: 'Bob', email: 'alice@test.com', password: '654321' }))
      .rejects.toBeInstanceOf(UserAlreadyExistsError);
  });
});
