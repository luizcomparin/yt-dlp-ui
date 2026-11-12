# Módulo: playlist (listagem + enriquecimento)

> Arquivos: `src/main/playlist/service.ts`, `list.ts`, `enrich.ts`
> Apoio: `src/main/ytdlp/info.ts` (parsers), `src/main/ytdlp/errors.ts` (classificação)
> UI: `store/playlist.ts`, `components/PlaylistView.tsx`, `components/TrackRow.tsx`
> Fase: 2 · Requisitos: R5, R6

## Responsabilidade
A partir de um link (playlist ou vídeo único), montar a lista de faixas com título, thumbnail, duração, data, tamanho e disponibilidade, usando o cache do banco.

Não baixa nada. A seleção, a ordenação e a tabela completa ficam para a fase 3.

## Fluxo
```
playlist:load(url) ──▶ cancela carregamento anterior
  1. cache    ── se a playlist já existe no banco → emite info + faixas (instantâneo)
  2. flat     ── yt-dlp --flat-playlist --print "[ytui:entry] {campos}"
               cada linha → upsert no banco → faixa emitida (em lotes a cada 250 ms)
               fim → setPlaylistItems + evento "listed" (ordem final)
  3. enrich   ── só vídeos sem enriquecimento (ou todos, com refresh), exceto privados/removidos
               2 processos × 10 URLs por processo:
               yt-dlp -f bestaudio --print "[ytui:info] {campos}" URL1 … URL10
               cada resultado → banco → faixa atualizada + "enrich-progress"
  4. "enriched"
```

**Por que duas etapas:**
- **Listagem flat:** rápida (~3 s para 100 faixas), mas não traz data de upload nem formatos.
- **Enriquecimento:** ~1,4 s por vídeo, e traz a data (necessária para ordenar por mais recentes/antigas, R4), o tamanho exato e os formatos de áudio.

**Por que vários vídeos por processo:** cada inicialização do yt-dlp custa ~1 s. Com `--ignore-errors`, o erro de um vídeo não afeta os outros, e a linha `ERROR: [youtube] <id>: ...` indica a qual faixa ele pertence.

## Disponibilidade (R6)
| Valor | Origem |
|---|---|
| `pending` | Só dados da flat; enriquecimento ainda não feito |
| `available` | Enriquecimento OK |
| `private` / `deleted` | Título `[Private video]`/`[Deleted video]` na flat, ou erro do yt-dlp |
| `restricted` | Idade, membros, Premium ou `needs_auth`. Pode funcionar com cookies (fase 6) |
| `unavailable` | Bloqueio regional, live/estreia, "video unavailable" e erros desconhecidos |

- **Erros transitórios** (rede, 429, "not a bot") não alteram a faixa, que continua `pending`.
- **Rate limit:** o enriquecimento **para inteiro** e mostra um aviso. O backoff automático fica para a fase 4.

A UI tem o filtro "mostrar indisponíveis (N)" e o contador. Faixas indisponíveis aparecem esmaecidas e com o botão "baixar" desabilitado.

## Eventos (`playlist:event`)
`info` · `tracks` (upsert em lote) · `listed` (ordem final; remove da UI faixas do cache que saíram da playlist) · `enrich-progress` · `enriched` · `warning` · `error`.

Todos levam um `loadId`, e a UI ignora eventos de carregamentos antigos.

## Como a listagem flat indica vídeos indisponíveis
Na playlist real do usuário (637 faixas), **os 17 vídeos indisponíveis vieram da listagem flat sem título e sem duração**: só o id. Não aparecem como `[Private video]`.

O enriquecimento revelou o motivo real de cada um:

| Mensagem do yt-dlp | Classificação |
|---|---|
| "Private video…" | privado |
| "…account associated with this video has been terminated" | removido (conta encerrada) |
| "This video has been removed by the uploader" | removido |
| "It was removed following a copyright removal request by …" | removido (direitos autorais) |
| "Video unavailable. This video is not available" | indisponível (genérico) |
| "It was blocked due to the claimed content by SME" (Content ID) | indisponível: bloqueio por reivindicação da gravadora. Esses vídeos **têm título** na flat; só o enriquecimento detecta o bloqueio |

Resultado final na playlist do usuário:

| Status | Faixas |
|---|---|
| Disponíveis | 612 (48,7 h, 2,64 GB, todas com data e tamanho exato) |
| Privadas | 8 |
| Removidas | 9 (5 por conta encerrada, 3 por direitos autorais, 1 pelo autor) |
| Indisponíveis | 8 (5 por Content ID, 3 genéricas) |

Por isso, no banco:
- **Título:** se a flat não traz título, o título já conhecido é **mantido**. Um vídeo novo sem título usa o id provisoriamente.
- **Sumiu o título** de um vídeo que estava disponível → volta a `pending` e é re-enriquecido. Provavelmente ficou privado ou foi removido.
- **Voltou o título** de um vídeo privado ou removido → também é re-checado.
- **Indisponíveis com título** (Content ID, bloqueio regional) **não** são re-checados a cada carregamento: eles sempre têm título na flat, e re-checar só gastaria requisições.

## Validação (2026-11-10, yt-dlp 2026.10.26)
| Caso | Resultado |
|---|---|
| "Top 100 Songs Global" (99 faixas), 1ª carga | Faixas visíveis em 2,7 s; enriquecimento completo em 140 s (99/99 com data e tamanho exato) |
| Mesma playlist, recarga | Faixas do cache em **134 ms**; nada a re-enriquecer |
| Vídeo único | Tratado como playlist de 1 item (`video:<id>`) |
| Vídeo inexistente | Erro "vídeo indisponível" exibido, sem travar |

| Playlist do usuário (637 faixas) | Listagem em 8,8 s; casos privados, removidos e indisponíveis classificados conforme a tabela acima |

## Limitações conhecidas
- Vídeo único leva ~10 s: a flat de um vídeo já faz a extração completa, e o enriquecimento repete o trabalho. Dá para otimizar pulando a flat nesse caso.
- A concorrência e as pausas seguem o perfil anti-bloqueio ([queue](queue.md#anti-bloqueio-r13)). O tamanho do lote é fixo em 10 vídeos por processo.
- O enriquecimento leva de ~1,4 a 2,7 s por vídeo, conforme a resposta do YouTube. Para 637 faixas, isso dá ~15 a 25 min na primeira vez; depois vem do cache.
