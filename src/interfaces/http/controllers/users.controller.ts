import type { FastifyReply, FastifyRequest } from 'fastify';

import { makeGetUser } from '@/core/use-cases/factories/auth.factories';
import { ResourceNotFoundError } from '@/shared/errors';

export const getUser = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const { sub } = request.user;
    const { user } = await makeGetUser().execute({ userId: sub });
    return reply.status(200).send(user);
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: 'ResourceNotFoundError', message: err.message });
    }
    throw err;
  }
};
