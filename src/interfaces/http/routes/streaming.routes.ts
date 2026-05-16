import { z } from 'zod';

import type { FastifyTypedInstance } from '@/@types/fastifyTypes';
import { endPlayback, startPlayback, updateProgress } from '../controllers/streaming.controller';
import { streamProxy } from '../controllers/stream-proxy.controller';
import { verifyJWT } from '../middlewares/verifyJWT';

export const streamingRoutes = async (app: FastifyTypedInstance) => {
  app.post('/stream/start', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'startPlayback',
      body: z.object({ movieId: z.string() }),
      response: { 200: z.object({ sessionId: z.string(), streamUrl: z.string(), quality: z.string(), source: z.string() }) },
    },
  }, startPlayback);

  app.patch('/stream/progress', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'updateProgress',
      body: z.object({ sessionId: z.string(), movieId: z.string(), progressSecs: z.number() }),
      response: { 204: z.null() },
    },
  }, updateProgress);

  app.post('/stream/end', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'endPlayback',
      body: z.object({ sessionId: z.string() }),
      response: { 204: z.null() },
    },
  }, endPlayback);

  // No JWT — browser video element can't send auth headers
  app.get('/stream/proxy/:movieId', {
    schema: {
      operationId: 'streamProxy',
      params: z.object({ movieId: z.string() }),
    },
  }, streamProxy);
};
