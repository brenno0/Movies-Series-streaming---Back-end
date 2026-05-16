import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  makeEndPlayback,
  makeStartPlayback,
  makeUpdateProgress,
} from '@/core/use-cases/factories/streaming.factories';
import { ResourceNotFoundError } from '@/shared/errors';

export const startPlayback = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sub: userId } = request.user;
  const { movieId } = z.object({ movieId: z.string() }).parse(request.body);

  const { sessionId, streamUrl, quality, source } = await makeStartPlayback().execute({ userId, movieId });
  return reply.status(200).send({ sessionId, streamUrl, quality, source });
};

export const updateProgress = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sub: userId } = request.user;
  const { sessionId, movieId, progressSecs } = z.object({
    sessionId: z.string(),
    movieId: z.string(),
    progressSecs: z.number().int().min(0),
  }).parse(request.body);

  try {
    await makeUpdateProgress().execute({ sessionId, userId, movieId, progressSecs });
    return reply.status(204).send();
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: 'ResourceNotFoundError', message: err.message });
    }
    throw err;
  }
};

export const endPlayback = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sessionId } = z.object({ sessionId: z.string() }).parse(request.body);

  try {
    await makeEndPlayback().execute({ sessionId });
    return reply.status(204).send();
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: 'ResourceNotFoundError', message: err.message });
    }
    throw err;
  }
};
