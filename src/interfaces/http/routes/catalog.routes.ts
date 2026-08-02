import { z } from 'zod';

import type { FastifyTypedInstance } from '@/@types/fastifyTypes';
import { createMovie } from '../controllers/movies.controller';
import { createSeries } from '../controllers/series.controller';
import { getUser } from '../controllers/users.controller';
import { createWatchlist, deleteWatchlist, getAllWatchlists } from '../controllers/watchlist.controller';
import { verifyJWT } from '../middlewares/verifyJWT';

export const catalogRoutes = async (app: FastifyTypedInstance) => {
  app.post('/movies', {
    schema: {
      operationId: 'createMovie',
      body: z.object({
        title: z.string(),
        overview: z.string(),
        tmdbId: z.number(),
        imdbId: z.string().optional(),
        posterPath: z.string(),
        voteAverage: z.number(),
      }),
      response: { 201: z.object({ id: z.string(), title: z.string(), tmdbId: z.number(), imdbId: z.string().nullable().optional() }) },
    },
  }, createMovie);

  app.post('/series', {
    schema: {
      operationId: 'createSeries',
      body: z.object({
        title: z.string(),
        overview: z.string(),
        tmdbId: z.number(),
        imdbId: z.string().optional(),
        posterPath: z.string(),
        voteAverage: z.number(),
      }),
      response: { 201: z.object({ id: z.string(), title: z.string(), tmdbId: z.number(), imdbId: z.string().nullable().optional() }) },
    },
  }, createSeries);

  app.get('/user', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'getUser',
      response: {
        200: z.object({ id: z.string(), name: z.string(), email: z.string(), createdAt: z.date() }),
        404: z.object({ error: z.string(), message: z.string() }),
      },
    },
  }, getUser);

  app.get('/watchlist', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'getAllWatchlists',
      querystring: z.object({
        page: z.string().optional(),
        limit: z.string().optional(),
        orderBy: z.enum(['createdAt', 'title', 'voteAverage']).optional(),
        orderDirection: z.enum(['asc', 'desc']).optional(),
        title: z.string().optional(),
      }),
      response: {
        200: z.array(z.object({
          id: z.string(),
          tmdbId: z.number(),
          title: z.string(),
          overview: z.string(),
          posterPath: z.string(),
          voteAverage: z.number(),
          createdAt: z.date(),
          updatedAt: z.date(),
        })),
      },
    },
  }, getAllWatchlists);

  app.post('/watchlist', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'createWatchlist',
      body: z.object({ movieId: z.string() }),
      response: {
        201: z.object({
          id: z.string(),
          tmdbId: z.number(),
          title: z.string(),
          overview: z.string(),
          posterPath: z.string(),
          voteAverage: z.number(),
          createdAt: z.date(),
          updatedAt: z.date(),
        }),
        404: z.object({ error: z.string(), message: z.string() }),
        409: z.object({ error: z.string(), message: z.string() }),
      },
    },
  }, createWatchlist);

  app.delete('/watchlist/:id', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'deleteWatchlist',
      params: z.object({ id: z.string() }),
      response: {
        202: z.object({ message: z.string() }),
        404: z.object({ error: z.string(), message: z.string() }),
      },
    },
  }, deleteWatchlist);
};
