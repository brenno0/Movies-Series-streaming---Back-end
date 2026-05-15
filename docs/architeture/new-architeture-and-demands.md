# Backend OTT Orchestrator — Documentação Técnica (v2.0)

## 1. Visão Geral e "5 Cérebros"

O sistema atua como um BFF (Backend for Frontends), orquestrando a agregação de fontes e a entrega de vídeo. A estrutura é dividida em módulos lógicos que garantem escalabilidade e baixo acoplamento:

- **Aggregator**: Coleta fontes via addons HTTP do Stremio.
- **Ranker**: Aplica o modelo de score para selecionar o melhor link.
- **Orchestrator**: Controla o estado de reprodução e o fluxo end-to-end.
- **Streaming Layer**: Fábrica de vídeo que gera chunks HLS/DASH usando FFmpeg.
- **Player Engine**: Lógica adaptativa no frontend (ABR).

---

## 2. Domain-Driven Design (DDD)

### Bounded Contexts (Contextos Delimitados)

- **CatalogoContext**: Interação com TMDB e metadados de mídias.
- **StreamingContext**: Lógica de transcodificação, chunking e expurgo de arquivos.
- **RankingContext**: Regras de negócio para o cálculo de score dos streams.

### Blocos de Construção Táticos

- **Entidades**: Objetos com identidade única — `Movie`, `User`.
- **Value Objects**: Atributos imutáveis sem identidade própria — `StreamMetadata` (resolução, codec, bitrate).
- **Agregados**: `PlaybackSession` atua como raiz, garantindo consistência transacional entre usuário e stream.
- **Repositórios**: Encapsulam o acesso ao banco de dados, fornecendo a ilusão de uma coleção em memória.

---

## 3. Arquitetura do Banco de Dados (Persistência Poliglota)

### PostgreSQL — Persistência (ACID)

| Tabela | Propósito |
|---|---|
| `Users` | Dados de perfil e preferências |
| `AddonRegistry` | URLs e status dos addons do Stremio |
| `MediaProgress` | Ponto exato onde o usuário parou ("Continue Watching") |
| `FileMetadata` | Caminhos no Google Drive e metadados dos chunks gerados |

### Redis — Cache (Performance)

- **Stream Cache**: Resultados dos addons por filme, evitando chamadas repetidas.
- **Session Store**: Estados ativos de transcodificação.
- **Rate Limiting**: Controle de requisições por usuário.

---

## 4. Padrões de Código Limpo (Clean Code)

Baseado nos princípios de Robert C. Martin:

- **Regra do Escoteiro**: Deixe o código sempre mais limpo do que o encontrou.
- **Nomes Descritivos**: Funções e variáveis devem revelar intenção — ex: `calculateStreamScore` em vez de `calc`.
- **SRP (Responsabilidade Única)**: Cada classe ou função deve ter apenas um motivo para mudar.
- **Lei de Demeter**: Um módulo não deve conhecer os detalhes internos dos objetos que manipula (evitar "carrinhos de trem").
- **Preferência por Exceções**: Tratamento de erro robusto com `try-catch` em vez de retornar códigos de erro.
- **Factories**: Encapsular a criação de agregados complexos, separando construção do uso.

---

## 5. Sistema de Expurgo Automático (Janitor Logic)

Dado o limite de 100 GB no SSD, o gerenciamento de cache segue as seguintes políticas:

- **LRU (Least Recently Used)**: Quando o disco atinge 80% de uso, os chunks do filme menos recentemente acessado são deletados.
- **TTL no Redis**: Metadados de streams expiram após 1 hora.
- **TTL no sistema de arquivos**: Chunks de sessões inativas são marcados para deleção após 24h.
- **Temporary Storage**: Armazenamento temporário é liberado automaticamente ao fim do processamento ou quando o player fecha a conexão.

---

## 6. Estrutura de Pastas (Modular Monolith)

src/
├── @types/                 # Tipagem TypeScript
├── core/                   # Camada de Domínio (DDD)
│   ├── entities/           # Movie, User, Stream [57]
│   ├── value-objects/      # Resolution, Bitrate [57]
│   ├── aggregates/         # PlaybackSession [57]
│   └── use-cases/          # ExecuteRanking, ProcessVideo [58]
├── infrastructure/         # Camada de Tecnologia (Adapters) [59, 60]
│   ├── database/           # Prisma, Repositórios Postgres [58]
│   ├── cache/              # Redis (Streams e Rate Limit) [36]
│   ├── storage/            # GoogleDriveAdapter, LocalSSDAdapter [61]
│   └── video/              # FFmpeg Wrapper com NVENC [7]
├── interfaces/             # Entrada de dados (API) [62]
│   ├── http/               # Controllers Fastify e Rotas
│   └── workers/            # Consumidores de filas (Expurgo/Transcode)
└── shared/                 # Kernel compartilhado (Erros, Utils) [63]

--------------------------------------------------------------------------------
## 7. Fluxo de Transcodificação e Entrega

1. **Download**: O sistema baixa o vídeo bruto do Google Drive.
2. **Pipeline DAG**: O vídeo é segmentado em GOPs (Group of Pictures) para paralelismo.
3. **Encoding**: FFmpeg utiliza o encoder `h264_nvenc` para aproveitar a RTX 3060.
4. **Entrega**: O frontend consome a playlist `.m3u8` servida pelo backend via cache local no SSD.