# Design: dfindexer + Real-Debrid como fonte oficial de streaming

## Contexto

Hoje o backend resolve streams via addons Stremio (`AddonRegistry`), principalmente
o Torrentio pré-configurado com token de Real-Debrid (`prisma/seed.ts`). Torrentio
resolve magnet → link HTTP direto server-side (fora do nosso controle); o backend só
proxya (`stream-proxy.controller.ts`) o link final com suporte a range/seek.

O `dfindexer` (projeto irmão, já rodando e testado via Prowlarr) é um scraper de
torrents brasileiros que expõe uma API HTTP própria (`/indexers/{scraper}?q=...`).
Ele devolve **magnet links**, não links HTTP prontos — diferente do Torrentio.

## Objetivo

- Remover toda a camada de addons Stremio (Jackett, stremio-addon-jackett, Torrentio, `AddonRegistry`).
- `dfindexer` vira fonte oficial única de descoberta de torrents. Consulta os 5 scrapers
  (`starck`, `rede`, `comand`, `tfilme`, `bludv`) em paralelo, resultados mesclados.
- Real-Debrid resolve magnet → link HTTP direto (integração nova; hoje o token existe
  no `.env` mas não é usado em lugar nenhum do código).
- Reaproveitar 100% do proxy de streaming existente (range/seek) sem alterar seu
  comportamento externo — só muda a origem do link que ele proxya.

## Fora de escopo

- Frontend: spec separado, feito depois que o contrato de API do backend estiver fechado.
- Torrent-to-HTTP self-hosted (opção descartada — exigiria disco/banda no próprio servidor).
- Persistência de resultados de busca em banco (cache Redis de curto prazo é suficiente,
  mesma convenção já usada).
- Model `Episode` no Prisma (segue não existindo; season/episode continuam como
  parâmetros de request, não persistidos).

## Arquitetura

### Removido

- `docker-compose.yml`: serviços `nb-flix-flaresolverr`, `nb-flix-jackett`,
  `nb-flix-jackett-stremio`, volume `jackett-config`.
- `prisma/schema.prisma`: model `AddonRegistry`.
- `prisma/seed.ts`: conteúdo relacionado a addons (arquivo fica vazio ou é removido).
- `src/interfaces/http/controllers/addons.controller.ts` + `routes/addons.routes.ts`.
- `src/infrastructure/database/repositories/addon-registry.repository.ts`.
- `src/core/use-cases/ranking/aggregate-streams.use-case.ts` e
  `aggregate-series-streams.use-case.ts` (fetch via contrato Stremio).
- Referências a `AddonRegistry`/`aggregate-*` em `ranking.factories.ts`.

### Novo

**1. `DfindexerClient`** (`src/infrastructure/dfindexer/dfindexer.client.ts`)

- `search(scraperType, query, useFlaresolverr)` → `GET {DFINDEXER_URL}/indexers/{scraperType}?q=...&use_flaresolverr=...`.
- `searchAll(query)` → dispara os 5 scrapers em paralelo via `Promise.allSettled`
  (mesmo padrão de tolerância a falha parcial que existia no `aggregate-streams`
  antigo), cada resultado marcado com `scraperSource`.
- Campos usados do JSON de resposta do dfindexer: `title, magnet_link, info_hash,
  size, seed_count, leech_count, date, imdb, details`.

**2. Query builder** (util em `core/use-cases/ranking/`)

Formatos confirmados no código do `dfindexer` (`utils/text/query.py`):

- Filme: `"{title}"` (ano ajuda mas não é obrigatório, dfindexer tolera ±1 ano).
- Episódio: `"{title} S{season:02}E{episode:02}"`.
- Temporada completa: `"{title} temporada {season}"`.

`title` vem do registro local (`Movie`/`Series`, já upsertado com `title` no
ingest do catálogo) buscado por `tmdbId` — sem chamada extra à API do TMDB.

**3. `RealDebridClient`** (`src/infrastructure/real-debrid/real-debrid.client.ts`)

- `addMagnet(magnet)` → `POST /torrents/addMagnet`.
- `selectFiles(id, fileIds)` → `POST /torrents/selectFiles` (maior arquivo de vídeo).
- `getInfo(id)` → `GET /torrents/info/{id}`, poll até `status === 'downloaded'`
  (timeout curto, ex. 20s — RD costuma resolver na hora se já em cache).
- `unrestrictLink(link)` → `POST /unrestrict/link`.
- `resolveMagnetToUrl(magnet)` → orquestra os 4 passos acima; cacheia resultado no
  Redis por hash do magnet (TTL curto, ex. 4h — link do RD expira).

**4. Ranking adaptado** (`calculate-stream-score.use-case.ts`)

- Score passa a considerar: `seed_count` (peso maior), qualidade parseada do título
  (já padronizado pelo dfindexer: `1080p > 720p > 480p`), e `scraperSource`.
- Campo `addonSource` da entity vira `scraperSource: 'starck'|'rede'|'comand'|'tfilme'|'bludv'`.

**5. `GetBestStreamUseCase` adaptado**

```
DfindexerClient.searchAll(query)
  → CalculateStreamScore ordena resultados
  → top-N (ex. 5) candidatos
  → RealDebridClient.resolveMagnetToUrl() em paralelo nos top-N
  → probeStream (já existente em stream-proxy) valida o primeiro que responde bem
  → cacheia {streamUrl, quality, scraperSource} no Redis
  → retorna {sessionId, streamUrl, quality, source} — contrato de resposta inalterado
```

Série: mesmo fluxo; query inclui `S{season}E{episode}`; chave de cache já inclui
season/episode (convenção existente mantida).

**6. `stream-proxy.controller.ts` / `series-stream-proxy.controller.ts`**

Sem mudança de comportamento — continuam proxyando por range/seek. Só muda a
origem do link (agora vem do Real-Debrid via dfindexer, não mais via Torrentio).

**7. Env vars novas**

- `DFINDEXER_URL` (ex. `http://localhost:7006`) — nova, obrigatória.
- `REAL_DEBRID_TOKEN` — já existe no schema, passa a ser efetivamente usada.

## Erros e casos de borda

- Scraper individual do dfindexer fora do ar/timeout → `Promise.allSettled` ignora
  e segue com os que responderam. Se todos falharem → mesmo erro "nenhuma fonte
  disponível" que já existe hoje para addons indisponíveis.
- Magnet sem seeds / RD não consegue cachear → tenta o próximo candidato da lista
  ordenada por score.
- Token do RD inválido/expirado → erro 401 direto, sem retry (é config, não runtime).
- Nenhum resultado do dfindexer pra query → 404 "não encontrado" (comportamento atual).

## Migração de banco

- Nova migration Prisma: drop da tabela `AddonRegistry`.

## Testes

Sem TDD nesta rodada (pedido explícito). Implementação direta; testes ficam
opcionais/depois.

## Fora do backend (spec futuro, front-end)

- Seletor de scraper por título quando o resultado padrão não satisfizer.
- Exibição de qual scraper serviu o stream atual.
