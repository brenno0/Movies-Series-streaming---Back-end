import type { FastifyRequest, FastifyReply } from 'fastify';
import { MoviesPrismaRepository } from '@/infrastructure/database/repositories/movies.repository';

const moviesRepo = new MoviesPrismaRepository();

// OpenSubtitles language codes used by Stremio addon
const LANG_MAP: Record<string, string> = {
  pt: 'pob', // Brazilian Portuguese
  en: 'eng',
  es: 'spa',
};

function srtToVtt(srt: string): string {
  return (
    'WEBVTT\n\n' +
    srt
      .replace(/\r\n/g, '\n')
      .replace(/\r/g, '\n')
      // SRT uses comma for milliseconds, VTT uses dot
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2')
  );
}

export const getSubtitles = async (request: FastifyRequest, reply: FastifyReply) => {
  const { movieId } = request.params as { movieId: string };
  const { lang = 'pt' } = request.query as { lang?: string };

  const emptyVtt = () =>
    reply.header('Content-Type', 'text/vtt; charset=utf-8').header('Access-Control-Allow-Origin', '*').send('WEBVTT\n\n');

  const movie = await moviesRepo.findById(movieId);
  if (!movie?.imdbId) return emptyVtt();

  const stremioLang = LANG_MAP[lang] ?? LANG_MAP.pt;

  try {
    const res = await fetch(
      `https://opensubtitles-v3.strem.io/subtitles/movie/${movie.imdbId}.json`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!res.ok) return emptyVtt();

    const data = await res.json() as { subtitles?: Array<{ lang: string; url: string }> };
    const sub = data.subtitles?.find((s) => s.lang === stremioLang);
    if (!sub) return emptyVtt();

    const srtRes = await fetch(sub.url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!srtRes.ok) return emptyVtt();

    const srt = await srtRes.text();

    reply
      .header('Content-Type', 'text/vtt; charset=utf-8')
      .header('Access-Control-Allow-Origin', '*')
      .header('Cache-Control', 'public, max-age=3600');
    return reply.send(srtToVtt(srt));
  } catch {
    return emptyVtt();
  }
};
