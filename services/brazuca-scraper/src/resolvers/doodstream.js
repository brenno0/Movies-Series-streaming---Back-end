// DoodStream (dood.la / dood.cx / dood.sh) resolver
import { fetchPage } from '../flaresolverr.js';

const DOOD_HOSTS = ['dood.la', 'dood.cx', 'dood.sh', 'doodstream.com', 'ds2play.com'];

export function isDoodstream(url) {
  return DOOD_HOSTS.some((h) => url.includes(h));
}

export async function resolveDoodstream(embedUrl) {
  const url = embedUrl.replace('/d/', '/e/');
  const html = await fetchPage(url);

  // Look for pass_md5 token in rendered page
  const passMatch = html.match(/\/pass_md5\/([^?'"]+)/);
  if (!passMatch) return null;

  const passMd5Path = `/pass_md5/${passMatch[1]}`;
  const baseUrl = new URL(url).origin;
  const tokenUrl = `${baseUrl}${passMd5Path}`;

  // Fetch the token endpoint
  const tokenRes = await fetch(tokenUrl, {
    headers: {
      Referer: url,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!tokenRes.ok) return null;
  const videoBase = await tokenRes.text();

  // Final URL: videoBase + random12chars + ?token=xxx&expiry=xxx
  const tokenParam = html.match(/token=([^&'"]+)/)?.[1] ?? '';
  const expiry = html.match(/expiry=([^&'"]+)/)?.[1] ?? Date.now();
  const rand = Math.random().toString(36).slice(2, 14);

  return `${videoBase.trim()}${rand}?token=${tokenParam}&expiry=${expiry}`;
}
