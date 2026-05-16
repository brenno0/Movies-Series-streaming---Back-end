import type { FastifyReply, FastifyRequest } from 'fastify';

import { makeGetBestStream } from '@/core/use-cases/factories/ranking.factories';
import { ResourceNotFoundError, StreamNotFoundError } from '@/shared/errors';

export const streamProxy = async (request: FastifyRequest, reply: FastifyReply) => {
  const { movieId } = request.params as { movieId: string };

  const rangeHeader = request.headers.range;

  try {
    const { best } = await makeGetBestStream().execute(movieId);

    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
    };

    if (rangeHeader) {
      headers['Range'] = rangeHeader;
    }

    const upstream = await fetch(best.url, { headers });

    const status = upstream.status === 206 ? 206 : 200;

    const contentType = upstream.headers.get('content-type') ?? 'video/mp4';
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    const acceptRanges = upstream.headers.get('accept-ranges');

    const replyHeaders: Record<string, string> = {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
    };

    if (contentLength) replyHeaders['Content-Length'] = contentLength;
    if (contentRange) replyHeaders['Content-Range'] = contentRange;
    if (acceptRanges) replyHeaders['Accept-Ranges'] = acceptRanges;
    else replyHeaders['Accept-Ranges'] = 'bytes';

    if (!upstream.body) {
      return reply.status(502).send({ error: 'No stream body from source' });
    }

    reply.raw.writeHead(status, replyHeaders);

    const reader = upstream.body.getReader();
    const { raw } = reply;

    const pump = async () => {
      while (true) {
        const { done, value } = await reader.read();
        if (done) { raw.end(); break; }
        const canContinue = raw.write(value);
        if (!canContinue) {
          await new Promise<void>((resolve) => raw.once('drain', resolve));
        }
      }
    };

    raw.on('close', () => reader.cancel());
    pump().catch(() => raw.end());

    return reply;
  } catch (err) {
    if (err instanceof StreamNotFoundError || err instanceof ResourceNotFoundError) {
      return reply.status(404).send({ error: err.message });
    }
    throw err;
  }
};
