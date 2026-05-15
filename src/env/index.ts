import 'dotenv/config';

import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['dev', 'test', 'production']),
  PORT: z.coerce.number().default(3333),
  JWT_SECRET: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  GOOGLE_DRIVE_CREDENTIALS: z.string().optional(),
  DISK_THRESHOLD_PERCENT: z.coerce.number().default(80),
});

const _env = envSchema.safeParse(process.env);

if (_env.success === false) {
  throw new Error(`Invalid variables \n. ${_env.error.format()._errors}`);
}

export const env = _env.data;
