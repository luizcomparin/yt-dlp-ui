# Módulo: db

> Arquivos: `src/main/db/index.ts` (conexão + migrações), `src/main/db/library.ts` (repositório de playlists/vídeos)
> Fase: 2 · Decisão: [ADR 0002](../decisoes/0002-sqlite.md)

## Responsabilidade
Persistir o cache de playlists e vídeos em `%APPDATA%\yt-dlp UI\app.db` (SQLite, modo WAL). Guarda também a fila de download (fase 4) e o log de erros (fase 5).

## Fluxo
1. `openDb(dbFile())` no startup do app aplica as migrações pendentes. Cada migração roda numa transação e incrementa `PRAGMA user_version`.
2. `createLibrary(db)` cria o repositório com statements preparados. Ele recebe o `db` por parâmetro, para poder ser testado com `':memory:'`.
3. `closeDb()` no `before-quit`.

## Esquema

**Migração 1 (fase 2):**
| Tabela | Conteúdo |
|---|---|
| `playlists` | `id` (o `list=` ou `video:<id>`), url, título, canal, contagem, `is_single`, `fetched_at` |
| `videos` | Dados por vídeo, compartilhados entre playlists: título, canal, duração, `upload_date`, disponibilidade + motivo, tamanho (e se é estimado), `best_format_json`, `formats_json`, `enriched_at` |
| `playlist_items` | (playlist, vídeo, posição). Reescrita a cada listagem |

**Migração 2 (fase 4):** tabela `jobs`, a fila de download. Ver [queue](queue.md#persistência).

**Migração 3 (fase 5):** tabela `errors`, o log de falhas. Ver [errors](errors.md).

**Migração 4 (fase 7):** tabela `downloads` (onde cada vídeo foi salvo). Ver [extras](extras.md).

**Migração 5:** tabela `replacements` (faixa da playlist trocada por outro vídeo). Ver [replace](replace.md).

## Regras de atualização
| Situação | Comportamento |
|---|---|
| Nova listagem flat | **Não apaga** dados do enriquecimento (data, tamanho, formatos) |
| Flat traz `[Private video]` ou `[Deleted video]` | Marca a disponibilidade, mas **preserva o título já conhecido**. Útil para saber qual música sumiu |
| Disponibilidade na flat | Só sobrescreve quando a listagem traz informação concreta (privado/removido/restrito) |
| Sumiu o título de um vídeo disponível | Volta a `pending` e é re-enriquecido |
| Voltou o título de um vídeo **privado/removido** | Volta a `pending` e é re-enriquecido |
| Vídeo `unavailable` com título (Content ID, bloqueio regional) | **Não** é re-checado a cada listagem |
| Vídeo repetido na mesma playlist | Fica só na 1ª posição |

## Interface (`Library`)
| Método | Uso |
|---|---|
| `upsertPlaylist`, `getPlaylist` | Metadados da playlist |
| `upsertFlatEntry` | Dados da listagem flat |
| `saveEnriched`, `markUnavailable` | Resultado do enriquecimento |
| `setPlaylistItems` | Ordem atual da playlist |
| `getPlaylistTracks`, `getTrack` | Leitura como `Track` (tipo compartilhado com a UI) |

## Dependências
`node:sqlite` (embutido no Node/Electron).

## Testes
`library.test.ts`: ordem, reescrita de itens, duplicatas, preservação do enriquecimento e do título de vídeo privado.
