const FLARESOLVERR_URL = process.env.FLARESOLVERR_URL ?? 'http://nb-flix-flaresolverr:8191';

export async function fetchPage(url) {
  const res = await fetch(`${FLARESOLVERR_URL}/v1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmd: 'request.get', url, maxTimeout: 45000 }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) throw new Error(`FlareSolverr HTTP ${res.status}`);
  const data = await res.json();
  if (data.status !== 'ok') throw new Error(`FlareSolverr: ${data.message ?? 'unknown error'}`);
  return data.solution.response;
}
