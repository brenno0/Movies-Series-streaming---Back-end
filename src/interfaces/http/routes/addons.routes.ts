import { z } from 'zod';

import type { FastifyTypedInstance } from '@/@types/fastifyTypes';
import { createAddon, deleteAddon, getAddons } from '../controllers/addons.controller';
import { verifyJWT } from '../middlewares/verifyJWT';

export const addonsRoutes = async (app: FastifyTypedInstance) => {
  app.get('/addons', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'getAddons',
      response: { 200: z.array(z.object({ id: z.string(), name: z.string(), url: z.string(), active: z.boolean() })) },
    },
  }, getAddons);

  app.post('/addons', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'createAddon',
      body: z.object({ name: z.string(), url: z.string() }),
      response: { 201: z.object({ id: z.string(), name: z.string(), url: z.string() }) },
    },
  }, createAddon);

  app.delete('/addons/:id', {
    onRequest: [verifyJWT],
    schema: {
      operationId: 'deleteAddon',
      params: z.object({ id: z.string() }),
      response: { 204: z.null() },
    },
  }, deleteAddon);
};
