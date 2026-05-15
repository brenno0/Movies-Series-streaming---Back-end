import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import {
  makeCreateWatchlist,
  makeDeleteWatchlist,
  makeGetAllWatchlist,
} from '@/core/use-cases/factories/catalog.factories';
import { ResourceAlreadyExistsError, ResourceNotFoundError } from '@/shared/errors';

export const getAllWatchlists = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sub: userId } = request.user;

  const query = z.object({
    page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
    limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
    orderBy: z.enum(['createdAt', 'title', 'voteAverage']).optional(),
    orderDirection: z.enum(['asc', 'desc']).optional().default('asc'),
    title: z.string().optional(),
  }).parse(request.query);

  const watchList = await makeGetAllWatchlist().execute({
    userId,
    page: query.page,
    limit: query.limit,
    orderBy: query.orderBy ? { field: query.orderBy, direction: query.orderDirection } : undefined,
    filter: query.title ? { title: query.title } : undefined,
  });

  const result = (watchList as Array<Record<string, unknown> & { movie?: Record<string, unknown> }>).map((item) => ({
    id: item.id,
    tmdbId: item.movie?.tmdbId ?? 0,
    title: item.movie?.title ?? '',
    overview: item.movie?.overview ?? '',
    posterPath: item.movie?.posterPath ?? '',
    voteAverage: item.movie?.voteAverage ?? 0,
    createdAt: item.createdAt,
    updatedAt: item.movie?.updatedAt ?? item.createdAt,
  }));

  return reply.status(200).send(result);
};

export const createWatchlist = async (request: FastifyRequest, reply: FastifyReply) => {
  const { sub: userId } = request.user;
  const { movieId } = z.object({ movieId: z.string() }).parse(request.body);

  try {
    const { watchList, movie } = await makeCreateWatchlist().execute({ userId, movieId });
    return reply.status(201).send({
      id: watchList.id,
      tmdbId: movie.tmdbId,
      title: movie.title,
      overview: movie.overview,
      posterPath: movie.posterPath,
      voteAverage: movie.voteAverage,
      createdAt: watchList.createdAt,
      updatedAt: movie.updatedAt,
    });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: 'ResourceNotFoundError', message: err.message });
    }
    if (err instanceof ResourceAlreadyExistsError) {
      return reply.status(409).send({ error: 'ResourceAlreadyExistsError', message: err.message });
    }
    throw err;
  }
};

export const deleteWatchlist = async (request: FastifyRequest, reply: FastifyReply) => {
  const { id } = z.object({ id: z.string() }).parse(request.params);

  try {
    await makeDeleteWatchlist().execute({ id });
    return reply.status(202).send({ message: 'Removed from watchlist.' });
  } catch (err) {
    if (err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: 'ResourceNotFoundError', message: err.message });
    }
    throw err;
  }
};
