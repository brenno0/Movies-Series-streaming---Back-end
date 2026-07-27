import type { DfindexerCandidate, DfindexerResult, ScraperType } from './dfindexer.types';

const SCRAPERS: ScraperType[] = ['starck', 'rede', 'tfilme', 'comand', 'bludv'];

// Sites behind Cloudflare per dfindexer's own README — need FlareSolverr to pass the challenge.
const NEEDS_FLARESOLVERR: Set<ScraperType> = new Set(['comand', 'bludv']);

const REQUEST_TIMEOUT_MS = 25000;

export class DfindexerClient {
  constructor(private readonly baseUrl: string) {}

  async search(scraperType: ScraperType, query: string): Promise<DfindexerResult[]> {
    const useFlaresolverr = NEEDS_FLARESOLVERR.has(scraperType);
    const url = `${this.baseUrl}/indexers/${scraperType}?q=${encodeURIComponent(query)}&use_flaresolverr=${useFlaresolverr}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return [];
      const data = (await res.json()) as { results?: DfindexerResult[] };
      return data.results ?? [];
    } catch {
      return [];
    } finally {
      clearTimeout(timeout);
    }
  }

  async searchAll(query: string): Promise<DfindexerCandidate[]> {
    const settled = await Promise.allSettled(
      SCRAPERS.map((scraperType) => this.search(scraperType, query)),
    );

    const candidates: DfindexerCandidate[] = [];
    settled.forEach((result, index) => {
      if (result.status !== 'fulfilled') return;
      const scraperSource = SCRAPERS[index];
      result.value.forEach((r) => candidates.push({ ...r, scraperSource }));
    });

    return candidates;
  }
}
