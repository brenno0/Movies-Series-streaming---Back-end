import type { Prisma, User } from 'generated/prisma';

import { prisma } from '../prisma';

export interface UsersRepository {
  create(data: Prisma.UserCreateInput): Promise<User>;
  getUserById(userId: string): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
}

export class UsersPrismaRepository implements UsersRepository {
  async create(data: Prisma.UserCreateInput): Promise<User> {
    return prisma.user.create({ data });
  }

  async getUserById(userId: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id: userId } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email } });
  }
}
