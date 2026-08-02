export async function resolveTitle(imdbId, type = 'movie') {
  try {
    const res = await fetch(`https://v3-cinemeta.strem.io/meta/${type}/${imdbId}.json`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.meta?.name ?? null;
  } catch {
    return null;
  }
}
