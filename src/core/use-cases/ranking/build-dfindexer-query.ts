export function buildMovieQuery(title: string): string {
  return title;
}

export function buildEpisodeQuery(title: string, season: number, episode: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${title} S${pad(season)}E${pad(episode)}`;
}
