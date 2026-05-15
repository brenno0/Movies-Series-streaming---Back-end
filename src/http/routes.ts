import { z } from 'zod';

import type { FastifyTypedInstance } from '@/@types/fastifyTypes';

import { authenticate, createUser } from './controllers/auth.controller';
import { createMovie } from './controllers/movies.controller';
import { getUser } from './controllers/users.controller';
import {
  createWatchList,
  deleteWatchList,
  getAllWatchLists,
} from './controllers/watchList.controller';
import { verifyJWT } from './middlewares/verifyJWT';

export const appRoutes = async (app: FastifyTypedInstance) => {
  app.post(
    '/auth/sign-up',
    {
      schema: {
        operationId: 'createUser',
        body: z.object({
          name: z.string(),
          email: z.string(),
          password: z.string(),
        }),

        response: {
          201: z.object({
            createdAt: z.date(),
            id: z.string(),
            name: z.string(),
            email: z.string(),
            password: z.string(),
          }),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    createUser,
  );
  app.post(
    '/auth/sign-in',
    {
      schema: {
        operationId: 'authUser',
        body: z.object({
          email: z.string(),
          password: z.string(),
        }),
        response: {
          200: z.object({
            token: z.string(),
          }),
          401: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    authenticate,
  );

  /* Authenticated routes */

  // User
  app.get(
    '/user',
    {
      onRequest: [verifyJWT],
      schema: {
        operationId: 'getUser',
        response: {
          200: z.object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            createdAt: z.date(),
          }),
          400: z.object({
            error: z.string(),
            message: z.string(),
          }),
        },
      },
    },
    getUser,
  );

  // WatchList
  app.get(
    '/watchlist',
    {
      onRequest: [verifyJWT],
      schema: {
        querystring: z.object({
          page: z
            .string()
            .optional()
            .transform((val) => parseInt(String(val), 10)),
          limit: z
            .string()
            .optional()
            .transform((val) => parseInt(String(val), 10)),
          orderBy: z.enum(['createdAt', 'title', 'voteAverage']).optional(),
          orderDirection: z.enum(['asc', 'desc']).optional().default('asc'),
          title: z.string().optional(),
        }),
        response: {
          200: z.array(
            z.object({
              id: z.string(),
              tmdbId: z.number(),
              title: z.string(),
              overview: z.string(),
              posterPath: z.string(),
              voteAverage: z.number(),
              createdAt: z.date(),
              updatedAt: z.date(),
            }),
          ),
          500: z.object({
            message: z.string(),
            error: z.string(),
          }),
        },
      },
    },
    getAllWatchLists,
  );

  app.post(
    '/watchlist',
    {
      onRequest: [verifyJWT],
      schema: {
        operationId: 'createWatchList',
        body: z.object({
          movieId: z.string(),
        }),
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
          400: z.object({
            message: z.string(),
            error: z.literal('ResourceNotFound'),
          }),
          404: z.object({
            message: z.string(),
            error: z.literal('ResourceNotFound'),
          }),
        },
      },
    },
    createWatchList,
  );
  app.delete(
    '/watchlist/:id',
    {
      onRequest: [verifyJWT],
      schema: {
        operationId: 'deleteWatchList',
        params: z.object({
          id: z.string(),
        }),
        response: {
          202: z.object({
            message: z.string(),
          }),
          404: z.object({
            message: z.string(),
            error: z.literal('ResourceNotFound'),
          }),
        },
      },
    },
    deleteWatchList,
  );

  //Movies
  app.post(
    '/movies',
    {
      onRequest: [verifyJWT],
      schema: {
        operationId: 'createMovie',
        body: z.object({
          overview: z.string(),
          posterPath: z.string(),
          title: z.string(),
          tmdbId: z.number(),
          voteAverage: z.number(),
        }),
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
          400: z.object({
            message: z.string(),
            error: z.string(),
          }),
          500: z.object({
            message: z.string(),
            error: z.string(),
          }),
        },
      },
    },
    createMovie,
  );
};
