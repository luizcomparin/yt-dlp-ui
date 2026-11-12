# Módulo: extras (M3U, área de transferência, duplicadas, notificações)

> Arquivos:
> - main: `src/main/library/index.ts` (downloads, pasta, M3U), `src/main/system/clipboard.ts`, `src/main/system/notify.ts`
> - compartilhado: `src/shared/m3u.ts`, `src/shared/duplicates.ts` (+ `extras.test.ts`)
> - UI: `store/playlist.ts` (`refreshFolder`, `fileMatch`, `alreadyInFolder`), `store/queue.ts` (`onQueueDrained`), `store/useVisibleTracks.ts` (`writeCurrentM3u`), `TrackRow.tsx` (marcas), `PlaylistView.tsx` (botão M3U), `App.tsx` (aviso do clipboard)
>
> Fase: 7 · Requisitos: R10, R11, R14, R15

## Registro de downloads (base para M3U e duplicadas)
- **Tabela `downloads`** (migração 4): `(video_id, output_dir)` → `file_path`, título e data.
- **Preenchimento:** a fila grava uma linha a cada download concluído.
- **Permanência:** diferente da tabela `jobs`, não some com "limpar concluídos".

## R10 — Playlist M3U
- **Botão "M3U"** (barra inferior da playlist): gera ou sobrescreve `<pasta>/<título da playlist>.m3u8` **na ordem exibida** (a ordenação escolhida, sem os filtros de texto).
- **Automático:** quando a fila esvazia, se `autoM3u` estiver ligado (padrão) e houver uma playlist carregada, o M3U é gerado do mesmo jeito.

**Como cada arquivo é encontrado** (`writeM3u`):
1. registro em `downloads` para essa pasta, se o arquivo ainda existir;
2. senão, um arquivo de áudio da pasta cujo nome corresponda ao título (downloads antigos ou feitos fora do app).

**Faixas sem arquivo** ficam de fora, e a UI informa quantas.

**Formato** (`buildM3u`): `#EXTM3U`, `#EXTINF:<segundos>,<título>`, caminho **relativo** (funciona se a pasta for movida), UTF-8 (`.m3u8`).

## Datas dos arquivos na ordem da playlist
Com `orderFileDates` ligado (padrão; "Ajustar datas dos arquivos na ordem da playlist"), cada geração de M3U (botão ou automática) também reescreve as datas dos arquivos encontrados:
- **Intervalo:** 1 minuto entre eles, na ordem da playlist, terminando no horário atual.
- **Efeito:** ordenar a pasta por data (criação ou modificação) reproduz a ordem da playlist, inclusive para faixas baixadas depois (re-tentativas, substituições).
- **Data de modificação:** `fs.utimes`.
- **Data de criação:** o Node não altera no Windows, então um único `powershell.exe` ajusta `CreationTime` de todos os arquivos, lendo a lista de um JSON UTF-8 temporário (funciona com nomes em coreano etc.).
- **Validado:** 2 arquivos baixados em ordem invertida ficaram 1 min apart na ordem pedida (criação e modificação).

## R11 — Área de transferência
- **Funcionamento:** polling de 1 s (`clipboard.readText()`, que é **assíncrono** no Electron 45). O que já estava copiado ao abrir o app é ignorado.
- **Quando o texto copiado é inteiro um link do YouTube** (vídeo, playlist, shorts, live, youtu.be, music.youtube):
  - aparece um aviso no canto superior direito: "Link do YouTube copiado — Carregar / ignorar";
  - o aviso some em 20 s;
  - links iguais à playlist já carregada são ignorados.
- **Desligar:** opção "Oferecer carregar links do YouTube copiados" nas configurações.

## R14 — Duplicadas
`refreshFolder(outputDir)` (chamado ao carregar playlist, trocar de pasta e esvaziar a fila) consulta `library:folder-info`:

| Situação | Marca na faixa | Seleção padrão |
|---|---|---|
| No archive da pasta, ou job concluído **nesta** pasta | **✓ baixada** | desmarcada |
| Arquivo de áudio na pasta com o mesmo nome do título | **já existe na pasta** (dica com o nome do arquivo) | desmarcada |
| Baixada pelo app em **outra** pasta (e o arquivo ainda existe) | **baixada em outra pasta** (dica com a pasta) | (não muda) |

- **Comparação por nome** (`nameKey`/`fileKey`):
  - desfaz as trocas do yt-dlp para nomes de arquivo no Windows (`⧸ → /`, `： → :`, `？ → ?`…);
  - remove acentos, caixa, pontuação e o prefixo "`001 - `" da numeração;
  - considera só extensões de áudio. Funciona com qualquer alfabeto (ex.: coreano).
- **"só não baixadas":** seleciona as visíveis que não estão na pasta por nenhum dos dois critérios.
- **Onde aparecem as marcas:** na **segunda linha** da faixa, junto do canal, para nunca espremer o título.

## R15 — Notificações e barra de tarefas
- **Notificação do Windows:**
  - "**Downloads concluídos**" (ou "…com erros") quando a fila esvazia, com o resumo da rodada (baixadas / já existiam / com erro);
  - "**Fila pausada pelo YouTube**" ao entrar em cooldown;
  - clicar na notificação traz a janela para frente.
- **Barra de tarefas:** o ícone mostra o progresso da rodada, em amarelo quando pausada.
- **Desligar:** opção "Notificar ao terminar / pausar por bloqueio".
- **Pré-requisito no Windows:** um *AppUserModelId*. O app usa `com.ytdlpui.app` quando empacotado (o instalador registra o atalho) e o caminho do executável em modo dev.

## Validação (2026-11-11, playlist do usuário, pastas temporárias)
| Caso | Resultado |
|---|---|
| Arquivo "Nightcore - Bad Girl.opus" criado antes na pasta | Faixa marcada "já existe na pasta", desmarcada; cabeçalho "1 já existem na pasta" |
| 2 faixas pelo ↓ | "✓ baixada"; notificação **exibida** (log `[notify] exibida: Downloads concluídos`) |
| Botão M3U com ordem inversa | `Nightcore.m3u8` com 3 faixas na ordem inversa, durações e caminhos relativos; aviso "634 ainda não baixadas ficaram de fora" |
| Trocar a pasta de destino | As 2 faixas viraram "baixada em outra pasta". Antes da correção, o job concluído na pasta antiga mostrava "✓ baixada" |
| Baixar 1 faixa na pasta nova, sem clicar em M3U | `Nightcore.m3u8` gerado automaticamente; 2ª notificação exibida |
| Copiar um link do YouTube | Aviso "Link do YouTube copiado". O conteúdo original da área de transferência do usuário foi salvo antes e restaurado depois |
| Layout com os dois painéis abertos | Sem rolagem horizontal. A coluna "Publicado" se esconde quando a tabela fica estreita (container query `@4xl`) |
