# Módulo: queue (fila de download)

> Arquivos:
> - main: `src/main/queue/manager.ts` (agendador), `policy.ts` (decisões puras), `files.ts` (archive e limpeza), `repo.ts` (SQLite)
> - compartilhado: `src/shared/antiblock.ts` (perfis), tipos `QueueJob`, `QueueState`, `EnqueueItem` em `src/shared/ipc.ts`
> - UI: `store/queue.ts`, `components/QueuePanel.tsx`, status por faixa em `components/TrackRow.tsx`
>
> Fase: 4 · Requisitos: R7 (pausar/retomar, erros sem travar), R9 (sincronizar), R13 (anti-bloqueio)
> Substitui o download avulso da fase 1 (`download/single.ts`, removido).

## Responsabilidade
Baixar uma lista de faixas na ordem escolhida, com concorrência limitada, pausar/retomar, re-tentativas e proteção contra bloqueio. Pula o que já foi baixado e sobrevive ao fechamento do app.

## Fluxo
```
UI "Baixar selecionadas" ─ queue:add(itens na ordem visível) ─▶ manager.addToQueue
   └ fixa por job: pasta, formato (-f), template (com numeração opcional) e posição

tick()  ── enquanto !pausado && !cooldown && rodando < concorrência(perfil):
   └ próximo job 'queued' (menor posição, fora de espera de retry) ─▶ start(job)
        1. já está no archive da pasta? → 'skipped' (nem chama o yt-dlp)
        2. buildDownloadArgs(+ --download-archive, + args anti-bloqueio, + extras do usuário)
        3. runner.run(yt-dlp) → progresso/pós-processamento → eventos (lote a cada 250 ms)
        4. ao sair: policy.decideOutcome → done | skipped | retry | rate-limit | error
   └ tick() de novo
```

## Estados do job
| Status | Significado | Agendado? |
|---|---|---|
| `queued` | Aguardando vaga (ou espera de retry) | sim |
| `running` | yt-dlp em execução | — |
| `paused` | Pausado pelo usuário | não, até "retomar" |
| `done` | Concluído (`filePath` preenchido) | — |
| `skipped` | Já estava no archive | — |
| `error` | Falhou (erro permanente ou tentativas esgotadas) | não, até "tentar de novo" |

## Decisão ao terminar (`policy.decideOutcome`, função pura)
| Situação | Resultado |
|---|---|
| Código 0 com arquivo final | `done` |
| Código 0 **sem** arquivo final | `skipped`. Com `--print`, o yt-dlp fica em modo quiet e não avisa que pulou pelo archive |
| Qualquer linha `ERROR:` de bloqueio (429, "not a bot") | `rate-limit` → **cooldown global** |
| Erro transitório (rede, **403 Forbidden**) ou processo morto sem `ERROR:` | `retry` após 15 s, 30 s…, até 3 tentativas. Um 403 em qualquer linha conta, mesmo seguido de outro erro |
| Erro permanente (privado, removido, bloqueado…) | `error`, sem retry. A classificação vem de `ytdlp/errors.ts` |

Toda falha (`retry`, `rate-limit`, `error`) é registrada no [log de erros](errors.md). Todo `done` é registrado em `downloads`, e o fim de cada "rodada" gera notificação e atualiza a barra de tarefas ([extras](extras.md)). O "tentar falhas de novo" da tela de erros chama `queue:retry-failed`.

## Erros: tentar de novo e substituir mantendo a posição
- **"tentar de novo"** (ou "tentar todas"): o job volta a `queued` **na mesma posição**. Como os pendentes seguintes têm posição maior, ele é o próximo a baixar.
- **Enfileirar de novo** um vídeo que tem job em `error` na mesma pasta ("Baixar selecionadas" ou ↓): **re-tenta o job existente** em vez de criar um duplicado no fim da fila. O retorno de `queue:add` traz `retried`.
- **"⇄ substituir"** num erro da fila: abre a janela de [substituição](replace.md) da linha correspondente (a playlist do job precisa estar carregada).
  - **Ao confirmar:** `queue:replace-job` troca o vídeo **no mesmo job**, mantendo a posição e o nome/numeração do arquivo. O formato volta para a preferência atual, e o `.part` do vídeo antigo é apagado.
  - **Pela tabela:** substituir uma faixa também troca o job com erro ou pendente dela, se existir.
- **Ordem na pasta:** um arquivo re-tentado ou substituído é criado depois dos vizinhos. Ao gerar o M3U, as datas dos arquivos são reescritas na ordem da playlist ([extras](extras.md#datas-dos-arquivos-na-ordem-da-playlist)).

## Posição de cada item
Cada item da fila mostra, antes do título, **o mesmo "#" da tabela da playlist** quando a playlist do job está carregada (inclusive para faixas substituídas, pelo vídeo efetivo). Sem a playlist carregada, ou num vídeo avulso, mostra a posição na fila, em itálico. A dica ao passar o mouse diz qual dos dois é.

## Mostrar/ocultar e ordenar (painel da fila)
Lógica pura em `src/renderer/src/lib/queueView.ts` (testes em `queueView.test.ts`). A escolha fica lembrada (`localStorage`: `queue.hidden`, `queue.sort`).

- **Contadores clicáveis:** "N baixando · N na fila · N pausados · N concluídos · N erros". Clicar **oculta ou mostra** aquele grupo, e o grupo oculto aparece riscado. Os grupos combinam livremente (ex.: só erros + na fila).
  - "concluídos" inclui os já existentes (`skipped`).
  - Se tudo ficar oculto, aparece "mostrar tudo".
- **Ordenar** (empates mantêm a ordem da fila):

  | Opção | Critério |
  |---|---|
  | Ordem da fila | `position` |
  | Término: mais recente / mais antigo | `finishedAt` (concluídos e erros); itens sem término no fim |
  | Erros primeiro | erro → baixando → na fila → pausados → concluídos |
  | Pendentes primeiro | baixando → na fila → pausados → erros → concluídos |

- **"tentar todas":** aparece quando há erros visíveis.
- **"limpar concluídos":** continua sendo a ação que **remove** os concluídos da lista.

## Pausar / retomar / remover
- **Pausar uma faixa:** mata a árvore do processo (`taskkill /T /F`). O `.part` fica no disco.
  - **Retomar:** o yt-dlp continua do `.part` ("Resuming download at byte N", verificado).
  - **Observação:** o contador de progresso no momento da pausa pode ser maior que o `.part` gravado, porque o `/F` descarta o buffer. A retomada parte do que está no disco.
- **Pausar tudo:** os downloads em andamento voltam para `queued` (na frente da fila) e nada novo inicia.
- **Remover:** se o job estava incompleto, apaga `.part`, `.ytdl`, o arquivo intermediário e a thumbnail (`.jpg/.webp/.png`), a partir do `filename` informado no progresso.
- **Limpar concluídos:** remove `done` e `skipped` da lista (os arquivos ficam).

## Anti-bloqueio (R13)
Perfis em `src/shared/antiblock.ts`. Valem para o download e para o enriquecimento da playlist.

| Perfil | Downloads simultâneos | `--sleep-requests` | Pausa antes de cada download |
|---|---|---|---|
| **Seguro** (padrão) | 1 | 1 s | 3–8 s aleatório |
| Normal | 2 | 0,5 s | 1–4 s |
| Rápido | 3 | — | — |

**Bloqueio detectado:**
1. Pausa global (**cooldown**) de 1 → 5 → 15 → 30 min, crescendo a cada bloqueio seguido. Um download com sucesso zera a escada.
2. Os downloads em andamento são interrompidos e voltam à fila; o job bloqueado não conta como tentativa.
3. "Retomar" encerra a espera manualmente.

**Limite de velocidade:** `--limit-rate`, opcional.

## Sincronizar (R9)
- **Archive:** cada pasta de destino tem um `.yt-dlp-archive.txt` (download archive do yt-dlp, uma linha `youtube <id>` por vídeo baixado).
- **Na tabela:** faixas no archive aparecem como **"✓ baixada"** e já vêm **desmarcadas**.
  - O botão "só não baixadas" refaz essa seleção.
  - O cabeçalho mostra "N já baixadas".
- **Enfileirar algo já baixado:** vira `skipped` imediatamente, sem chamar o yt-dlp.
- **Trocar a pasta de destino:** o archive é relido.

## Persistência
- **Tabela `jobs`** (migração 2): guarda as mudanças de status. O progresso fica só em memória.
- **Ao abrir o app:** jobs que estavam `running` voltam a `queued`, e a fila **inicia pausada**. Retomar é decisão do usuário.
- **Ao fechar:** os downloads são interrompidos (o `.part` fica) e devolvidos à fila.

## Numeração (opcional)
Com "Numerar arquivos na ordem escolhida", o arquivo recebe o prefixo `01 - `, `02 - `…

- **Modo** (`settings.numberMode`, entra nos presets):
  - **`batch` — por download (padrão):** `01, 02…` dentro de cada lote. Baixar as faixas 51–60 gera `01 -` … `10 -`.
  - **`position` — pela posição na playlist:** o número da coluna # (ordem escolhida). Baixar as faixas 51–60 gera `051 -` … `060 -` (largura pelo total da playlist).
- **Número calculado na UI:** a UI envia em cada item (`EnqueueItem.number`/`numberTotal`) o número que mostrou na prévia do título ([ui-playlist](ui-playlist.md#prévia-da-numeração)). No modo lote, só as faixas que viram arquivo novo são numeradas: já baixadas (archive), já na fila e re-tentativas de erro ficam de fora, então não há buracos na sequência (antes, faixas já no archive consumiam um número).
- **Sem número** no item: usa a ordem dentro do lote.
- **Presets antigos** (sem `numberMode`) valem como `batch` (`presetValuesOf`).
- **Largura:** mínima 2, ou a do total (`numberPrefix` em `src/shared/tracks.ts`, usado por `numberedTemplate`).

## Interface (IPC)
`queue:list`, `queue:add`, `queue:pause-all`, `queue:resume-all`, `queue:pause-job`, `queue:resume-job`, `queue:retry-job`, `queue:remove-job`, `queue:clear-finished`, `archive:ids`.

Evento `queue:event`: `jobs` (upsert em lote), `removed`, `state` (pausa, cooldown, contadores), `archived` (para a marca "baixada").

## Configurações relacionadas (`settings.json`)

Lista completa e presets em [settings](settings.md).

| Campo | Padrão |
|---|---|
| `outputDir` | `Música\yt-dlp-ui` |
| `outputTemplate` | `%(title)s.%(ext)s` |
| `cropThumbnail` | `true` |
| `audioFormat` | `best` |
| `antiBlock` | `safe` |
| `limitRate` | `""` |
| `numberFiles` | `false` |
| `extraArgs` | `""` |
| `ffmpegPath` | `null` |
| `ytdlpChannel` | `stable` |

## Validação (2026-11-11, yt-dlp 2026.10.26)
| Caso | Resultado |
|---|---|
| Lote de 4 (perfil Normal, numeração) | 2 simultâneos; 3 concluídos (`01 -`, `02 -`, `04 -`); o vídeo inexistente virou `error` sem retry, sem afetar os demais; 31 s no total |
| Re-enfileirar as já baixadas | 3 × `skipped` em 276 ms |
| Pausar → retomar | `.part` preservado; o yt-dlp retomou do byte gravado |
| Remover no meio | Job e arquivos parciais apagados |
| Pausar tudo / retomar | OK |
| Bloqueio simulado (extra args com `ERROR: … not a bot`) | Cooldown de 60 s, job de volta à fila sem contar tentativa; após retomar e bloquear de novo, 5 min |
| Reiniciar o app com job na fila | Job restaurado e fila pausada |
| ↓ em 4 faixas da playlist do usuário | 4 concluídas; status "baixando"/"na fila" visível na tabela |
| Enfileirar de novo um vídeo com erro (2026-11-11) | `retried: 1`, mesmo job (id e posição 621), sem duplicar |
| `replaceJob` no job com erro | Baixou o substituto; posição 621 mantida |
| 403 simulado (seguido de outro erro) | `queued`, `attempts: 1`, `forbidden`; log "acesso negado pelo YouTube (403), temporário" (não final) |
| Cópia dos dados do usuário | Filtro Erros (6) = as 6 faixas com 403; "⇄ substituir" habilitado; "Baixar selecionadas (6)" só com as que faltam |

## Testes
`policy.test.ts`: decisões, numeração, parser do archive, lista de arquivos parciais. Também `args.test.ts` (archive e ordem dos argumentos) e `parse.test.ts` (filename e archive).
