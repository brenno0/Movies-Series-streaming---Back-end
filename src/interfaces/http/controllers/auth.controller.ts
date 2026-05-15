import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { makeAuthenticate, makeCreateUser } from '@/core/use-cases/factories/auth.factories';
import { InvalidCredentialsError, UserAlreadyExistsError } from '@/shared/errors';

export const createUser = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = z.object({
    name: z.string(),
    email: z.string().email(),
    password: z.string().min(6),
  }).parse(request.body);

  try {
    const { user } = await makeCreateUser().execute(body);
    return reply.status(201).send(user);
  } catch (err) {
    if (err instanceof UserAlreadyExistsError) {
      return reply.status(400).send({ error: 'UserAlreadyExistsError', message: err.message });
    }
    throw err;
  }
};

export const authenticate = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(6),
  }).parse(request.body);

  try {
    const { user } = await makeAuthenticate().execute(body);
    const token = await reply.jwtSign({}, { sign: { sub: user.id } });
    return reply.status(200).send({ token });
  } catch (err) {
    if (err instanceof InvalidCredentialsError) {
      return reply.status(401).send({ error: 'InvalidCredentialsError', message: err.message });
    }
    throw err;
  }
};
