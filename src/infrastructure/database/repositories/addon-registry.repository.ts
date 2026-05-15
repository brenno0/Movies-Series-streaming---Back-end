import type { AddonRegistry, Prisma } from 'generated/prisma';

import { prisma } from '../prisma';

export interface AddonRegistryRepository {
  create(data: Prisma.AddonRegistryCreateInput): Promise<AddonRegistry>;
  findAll(onlyActive?: boolean): Promise<AddonRegistry[]>;
  findById(id: string): Promise<AddonRegistry | null>;
  findByUrl(url: string): Promise<AddonRegistry | null>;
  setActive(id: string, active: boolean): Promise<AddonRegistry>;
  deleteById(id: string): Promise<void>;
}

export class AddonRegistryPrismaRepository implements AddonRegistryRepository {
  async create(data: Prisma.AddonRegistryCreateInput): Promise<AddonRegistry> {
    return prisma.addonRegistry.create({ data });
  }

  async findAll(onlyActive = false): Promise<AddonRegistry[]> {
    return prisma.addonRegistry.findMany({
      where: onlyActive ? { active: true } : undefined,
    });
  }

  async findById(id: string): Promise<AddonRegistry | null> {
    return prisma.addonRegistry.findUnique({ where: { id } });
  }

  async findByUrl(url: string): Promise<AddonRegistry | null> {
    return prisma.addonRegistry.findUnique({ where: { url } });
  }

  async setActive(id: string, active: boolean): Promise<AddonRegistry> {
    return prisma.addonRegistry.update({ where: { id }, data: { active } });
  }

  async deleteById(id: string): Promise<void> {
    await prisma.addonRegistry.delete({ where: { id } });
  }
}
