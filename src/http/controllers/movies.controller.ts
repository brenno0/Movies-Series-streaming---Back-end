import type { FastifyReply, FastifyRequest } from 'fastify';
import z from 'zod';

import { makeCreateMovies } from '@/use-cases/factories/make-create-movie';

export const createMovie = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const { createMovieUseCase } = makeCreateMovies();
    const createMovieBodySchema = z.object({
      overview: z.string(),
      posterPath: z.string(),
      title: z.string(),
      tmdbId: z.number(),
      voteAverage: z.number(),
    });
    const { overview, posterPath, title, tmdbId, voteAverage } =
      createMovieBodySchema.parse(request.body);

    const movie = await createMovieUseCase.execute({
      overview,
      posterPath,
      title,
      tmdbId,
      voteAverage,
    });

    return reply.status(201).send(movie);
  } catch {
    throw new Error('Erro desconhecido no servidor');
  }
};
