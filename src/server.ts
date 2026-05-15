import { app } from './app';
import { env } from './env';
import { startJanitor } from './interfaces/workers/janitor.worker';

app
  .listen({
    port: env.PORT,
    host: '0.0.0.0',
  })
  .then(() => {
    console.log('Server is running!');
    startJanitor();
  });
