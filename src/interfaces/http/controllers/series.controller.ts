import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { makeCreateSeries } from '@/core/use-cases/factories/catalog.factories';

export const createSeries = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = z.object({
    title: z.string(),
    overview: z.string(),
    tmdbId: z.number(),
    imdbId: z.string().optional(),
    posterPath: z.string(),
    voteAverage: z.number(),
  }).parse(request.body);

  const series = await makeCreateSeries().execute(body);
  return reply.status(201).send(series);
};
