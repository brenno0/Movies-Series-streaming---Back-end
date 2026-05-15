import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { AddonRegistryPrismaRepository } from '@/infrastructure/database/repositories/addon-registry.repository';
import { ResourceAlreadyExistsError, ResourceNotFoundError } from '@/shared/errors';

const repo = new AddonRegistryPrismaRepository();

export const getAddons = async (_request: FastifyRequest, reply: FastifyReply) => {
  const addons = await repo.findAll();
  return reply.status(200).send(addons);
};

export const createAddon = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = z.object({
    name: z.string(),
    url: z.string().url(),
  }).parse(request.body);

  const existing = await repo.findByUrl(body.url);
  if (existing) throw new ResourceAlreadyExistsError({ resource: 'Addon' });

  const addon = await repo.create(body);
  return reply.status(201).send(addon);
};

export const deleteAddon = async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);

  const existing = await repo.findById(id);
  if (!existing) throw new ResourceNotFoundError({ resource: 'Addon' });

  await repo.deleteById(id);
  return reply.status(204).send();
};
