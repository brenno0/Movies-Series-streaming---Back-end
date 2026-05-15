import cors from '@fastify/cors';
import fastifyJwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import { fastifySwagger } from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import dotenv from 'dotenv';
import { fastify } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import { ZodError } from 'zod';

import { env } from './env';
import { prisma } from './infrastructure/database/prisma';
import { addonsRoutes } from './interfaces/http/routes/addons.routes';
import { authRoutes } from './interfaces/http/routes/auth.routes';
import { catalogRoutes } from './interfaces/http/routes/catalog.routes';
import { streamingRoutes } from './interfaces/http/routes/streaming.routes';

export const app = fastify().withTypeProvider<ZodTypeProvider>();
app.register(cors, {
  allowedHeaders: '*',
});

app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'nb-flix API',
      version: '3.0.0',
    },
  },
  transform: jsonSchemaTransform,
});

app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
});

dotenv.config();

app.decorate('prisma', prisma);

app.register(fastifyJwt, {
  secret: env.JWT_SECRET,
});
app.register(multipart);

app.register(authRoutes);
app.register(catalogRoutes);
app.register(streamingRoutes);
app.register(addonsRoutes);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof ZodError) {
    return reply
      .status(400)
      .send({ message: 'Validation Error', issues: error.format() });
  }

  if (env.NODE_ENV !== 'production') {
    console.error(error);
  } else {
    // Here we should log to an external tool like Datadog/NewRelic/Sentry
  }

  return reply.status(500).send({ message: 'Internal server error.' });
});
