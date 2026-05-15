import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { makeCreateMovie } from '@/core/use-cases/factories/catalog.factories';

export const createMovie = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = z.object({
    title: z.string(),
    overview: z.string(),
    tmdbId: z.number(),
    posterPath: z.string(),
    voteAverage: z.number(),
  }).parse(request.body);

  const movie = await makeCreateMovie().execute(body);
  return reply.status(201).send(movie);
};
