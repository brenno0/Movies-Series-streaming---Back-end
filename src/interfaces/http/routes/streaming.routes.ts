import { z } from 'zod';

import type { FastifyTypedInstance } from '@/@types/fastifyTypes';
import { endPlayback, startPlayback, updateProgress } from '../controllers/streaming.controller';
import { streamProxy, streamPrefetch } from '../controllers/stream-proxy.controller';
import { seriesStreamProxy, seriesStreamPrefetch } from '../controllers/series-stream-proxy.controller';
import { getSubtitles } from '../controllers/subtitles.controller';
import { verifyJWT } from '../middlewares/verifyJWT';

const scraperSourceSchema = z.enum(['starck', 'rede', 'tfilme', 'comand', 'bludv']);

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

  app.get('/stream/prefetch/:movieId', {
    schema: {
      operationId: 'streamPrefetch',
      params: z.object({ movieId: z.string() }),
      querystring: z.object({ lang: z.enum(['pt', 'en']).optional(), source: scraperSourceSchema.optional() }),
      response: { 200: z.object({ ready: z.boolean(), source: z.string().optional() }) },
    },
  }, streamPrefetch);

  // No JWT — browser video element can't send auth headers
  app.get('/stream/proxy/:movieId', {
    schema: {
      operationId: 'streamProxy',
      params: z.object({ movieId: z.string() }),
      querystring: z.object({ lang: z.enum(['pt', 'en']).optional(), source: scraperSourceSchema.optional() }),
    },
  }, streamProxy);

  // No JWT — browser video element can't send auth headers
  app.get('/stream/series/prefetch/:seriesId', {
    schema: {
      operationId: 'seriesStreamPrefetch',
      params: z.object({ seriesId: z.string() }),
      querystring: z.object({ season: z.string().optional(), episode: z.string().optional(), lang: z.enum(['pt', 'en']).optional(), source: scraperSourceSchema.optional() }),
      response: { 200: z.object({ ready: z.boolean(), source: z.string().optional() }) },
    },
  }, seriesStreamPrefetch);

  // No JWT — browser video element can't send auth headers
  app.get('/stream/series/proxy/:seriesId', {
    schema: {
      operationId: 'seriesStreamProxy',
      params: z.object({ seriesId: z.string() }),
      querystring: z.object({ season: z.string().optional(), episode: z.string().optional(), lang: z.enum(['pt', 'en']).optional(), source: scraperSourceSchema.optional() }),
    },
  }, seriesStreamProxy);

  // No JWT — <track> elements can't send auth headers
  app.get('/stream/subtitles/:movieId', {
    schema: {
      operationId: 'getSubtitles',
      params: z.object({ movieId: z.string() }),
      querystring: z.object({ lang: z.string().optional() }),
    },
  }, getSubtitles);
};
