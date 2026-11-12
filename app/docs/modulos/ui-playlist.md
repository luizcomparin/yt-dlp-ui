# Módulo: UI da playlist (tabela, seleção, ordenação, filtros, formato)

> Arquivos:
> - lógica pura: `src/shared/tracks.ts` (+ `tracks.test.ts`)
> - estado: `src/renderer/src/store/playlist.ts`, `store/useVisibleTracks.ts`, `store/settings.ts`
> - componentes: `components/PlaylistView.tsx`, `TrackTable.tsx`, `TrackRow.tsx`, `App.tsx` (layout)
>
> Fase: 3 · Requisitos: R1 (formato), R4 (ordenação), R5 (lista), R6 (filtro)

## Responsabilidade
Mostrar as faixas carregadas pelo módulo [playlist](playlist.md) e permitir escolher **o que** baixar (seleção), **em que ordem** (ordenação) e **em que formato**. O download em si é feito pela [fila](queue.md). **"Baixar selecionadas (N)"** enfileira as selecionadas **na ordem visível**. O ↓ de cada linha enfileira só aquela faixa.

## Fluxo de dados
```
store/playlist (tracks, order, selected, formatOverride, sortId, filterText, showUnavailable)
store/settings (audioFormat)
        │
        ▼
useVisibleTracks()  = sortTracks(filterTracks(tracks))        ← src/shared/tracks.ts (puro)
useSelectionSummary() = soma de duração/tamanho via pickFormat
        │
        ▼
PlaylistView ─▶ TrackTable (virtualizada) ─▶ TrackRow (seletores por faixa)
```
- **A ordem visível é a ordem de download.** A fila da fase 4 vai consumir `useVisibleTracks()` filtrado pelas selecionadas.
- **`TrackRow`** assina só os dados da própria faixa (`s.tracks[id]`, `s.selected[id]`…). Atualizações do enriquecimento, que chegam a cada 250 ms, re-renderizam só as linhas afetadas.

## Ordenação (R4) — `SORT_PRESETS`
| Opção | Chave |
|---|---|
| Ordem da playlist | `playlist` ↑ |
| Ordem inversa | `playlist` ↓ |
| Mais recentes | `date` ↓ |
| Mais antigas | `date` ↑ |
| Título (A–Z) | `title` ↑ (`Intl.Collator` pt-BR, sem diferenciar caixa e acentos) |
| Mais curtas | `duration` ↑ |
| Mais longas | `duration` ↓ |

- **Valores ausentes vão sempre para o fim**, em qualquer direção. Ex.: faixa sem data porque o enriquecimento ainda não chegou. A UI avisa "N faixas ainda sem data".
- **Empates** mantêm a ordem da playlist.

## Filtros (R6)
- **"Exibir"** (`AvailabilityFilter` em `src/shared/tracks.ts`). Cada opção mostra a contagem.

  | Opção | Mostra |
  |---|---|
  | Todas | Tudo |
  | Só disponíveis | Oculta privadas, removidas e indisponíveis. As `restricted` continuam, porque podem funcionar com cookies |
  | Precisam substituir | `needsReplacement`: indisponíveis, ou restritas sem formatos, **ainda não substituídas**. As mesmas que mostram o botão "⇄ substituir" ([replace](replace.md)) |
  | Substituídas | Faixas com `replacedFrom`, para revisar as trocas |
  | Erros de download | Faixas cujo job mais recente (do vídeo efetivo) está em `error` na pasta atual. Vem da fila (`useErrorVideoIds`) |

  Com "Precisam substituir" ativo, uma faixa some da lista assim que é substituída, e a contagem cai.
- **Busca:** por título ou canal, sem acento e sem diferenciar maiúsculas.

## Seleção
| Situação | Comportamento |
|---|---|
| Faixas novas | Entram **marcadas**, exceto as indisponíveis e as **já baixadas** (archive da pasta, R9) |
| "só não baixadas" | Seleciona as visíveis que não estão no archive |
| Faixa que se revela indisponível no enriquecimento | É desmarcada |
| Shift + clique | Aplica o mesmo valor ao intervalo, **na ordem visível** |
| Checkbox do cabeçalho, "marcar/desmarcar visíveis", "inverter" | Atuam só sobre as faixas visíveis (respeitam filtros e busca) |
| Recarregar a mesma URL | Preserva a seleção e os formatos escolhidos |

A barra inferior mostra a contagem, a duração e o tamanho total das selecionadas.

**"Baixar selecionadas (N)"**: N conta só as selecionadas que **ainda não** estão na fila (pendentes/concluídas) nem baixadas. Faixas com erro contam: são re-tentadas na mesma posição. Com N = 0, o botão fica desabilitado. O tamanho aparece com `~` se algum valor for estimado.

## Formato (R1)
**Preferência global** (`settings.audioFormat`), sempre **sem recodificar**:

| Preferência | Seletor `-f` |
|---|---|
| Melhor disponível | `bestaudio` |
| Opus | `bestaudio[acodec=opus]/bestaudio` |
| AAC (m4a) | `bestaudio[ext=m4a]/bestaudio` |

- **Por faixa:** a coluna Formato lista os formatos de áudio reais do vídeo, e a escolha manual (`formatOverride`) vai para o download como `formatId`, prevalecendo sobre a preferência global.
- **Coerência:** `pickFormat()` calcula o formato efetivo de cada faixa. As colunas Formato e Tamanho e o total da seleção usam essa mesma função. Versões **DRC** (`251-drc`) são ignoradas na escolha automática.

## Reabrir de onde parou (sessão)
`store/session.ts` guarda o estado da interface no `localStorage` da janela. É só estado de UI; os dados (cache, substituições, fila) já ficam no SQLite.

| Chave | Conteúdo | Restaurado quando |
|---|---|---|
| `ui.session` | Última playlist (URL), ordenação, filtro "Exibir", busca | Na abertura do app: a playlist é recarregada sozinha (do cache, na hora; a listagem atualiza em segundo plano) |
| `ui.sel:<url>` | Seleção (marcadas/desmarcadas explicitamente) e formatos escolhidos por faixa | Ao carregar aquela playlist. Faixas novas seguem a regra padrão |
| `ui.scroll:<url>` | Posição de rolagem da tabela | Uma vez, quando as faixas daquela playlist aparecem |

- **Gravação:** com debounce de 500 ms (sessão/seleção) e 300 ms (rolagem). A seleção só é gravada depois que a playlist tem faixas, para não gravar vazio durante o carregamento.
- **Outra playlist:** trocar de playlist limpa a busca. Na abertura do app, a busca restaurada é mantida.
- **Validado (cópia dos dados do usuário):** ordenação "Mais antigas", "Só disponíveis", 3 faixas desmarcadas e rolagem até a faixa 177 → fechar → reabrir sem cliques: tudo restaurado (609 selecionadas, mesma rolagem).

## Identidade das linhas
As linhas são chaveadas por `rowId` (o vídeo original da playlist): ordem, seleção e formato manual. O vídeo a baixar é `videoId`, que difere de `rowId` quando a faixa foi [substituída](replace.md).

## Layout
- **Painéis laterais retráteis** ("⚙" = dependências/configurações; "Downloads"), com estado lembrado no `localStorage` (`usePersistentState`).
- O painel ⚙ abre sozinho se faltar yt-dlp ou ffmpeg.
- **Coluna "Publicado"** se esconde quando a área da tabela fica estreita (container query `@4xl`), e as marcas de status ficam na 2ª linha da faixa ([extras](extras.md#r14--duplicadas)).
- **Tabela virtualizada** com `@tanstack/react-virtual`, com linhas de altura fixa (52 px). Nas 637 faixas, só ~20 linhas existem no DOM.

## Dependências
`@tanstack/react-virtual`, `zustand`.

## Validação (2026-11-10, playlist do usuário com 637 faixas)
- **Ordenação:** mais recentes (10/11/2026 primeiro), mais antigas (07/01/2007 primeiro), inversa (637, 636…).
- **Filtros:** ocultar indisponíveis → 633 visíveis. Busca "bad girl" → 2 faixas.
- **Seleção:** inverter, shift-intervalo (desmarcou exatamente as linhas 2 a 6) e checkbox do cabeçalho.
- **Formato:**
  - trocar para m4a altera os tamanhos;
  - download com preferência m4a gerou `.m4a` (AAC);
  - a escolha manual `251` gerou `.opus`, mesmo com preferência m4a;
  - os dois saíram com capa 360×360.
