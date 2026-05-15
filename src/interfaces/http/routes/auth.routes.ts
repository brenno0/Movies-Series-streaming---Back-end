import { z } from 'zod';

import type { FastifyTypedInstance } from '@/@types/fastifyTypes';
import { authenticate, createUser } from '../controllers/auth.controller';

export const authRoutes = async (app: FastifyTypedInstance) => {
  app.post('/auth/sign-up', {
    schema: {
      operationId: 'createUser',
      body: z.object({ name: z.string(), email: z.string(), password: z.string() }),
      response: {
        201: z.object({ id: z.string(), name: z.string(), email: z.string(), createdAt: z.date() }),
        400: z.object({ error: z.string(), message: z.string() }),
      },
    },
  }, createUser);

  app.post('/auth/sign-in', {
    schema: {
      operationId: 'authUser',
      body: z.object({ email: z.string(), password: z.string() }),
      response: {
        200: z.object({ token: z.string() }),
        401: z.object({ error: z.string(), message: z.string() }),
      },
    },
  }, authenticate);
};
