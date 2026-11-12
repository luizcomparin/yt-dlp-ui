# Módulo: runner

> Arquivos: `src/main/runner/index.ts`, `src/main/runner/lines.ts`
> Fase: 1

## Responsabilidade
Executar binários externos e entregar a saída **linha a linha**, além de matar o processo **com toda a árvore de filhos**. Não interpreta a saída: isso fica com `ytdlp/parse.ts`.

## Fluxo
1. `run(bin, args, { onStdout, onStderr })` faz `spawn` com `windowsHide`. O ambiente vem de `childEnv()`:
   - `PYTHONUTF8=1` e `PYTHONIOENCODING=utf-8`;
   - remove `ELECTRON_RUN_AS_NODE`.
2. stdout e stderr passam por um `LineSplitter`, que junta chunks e quebra em `\n`, `\r\n` ou `\r`.
3. `done` resolve com `{ code, killed }`.
4. `kill()` chama `killTree(pid)`:
   - **Windows:** `taskkill /PID <pid> /T /F`;
   - **outros sistemas:** `SIGKILL`.

`execCapture(bin, args)` é a variante para comandos curtos (ex.: `--version`): devolve stdout e stderr completos, com timeout.

## Por que matar a árvore
O `yt-dlp.exe` oficial (PyInstaller) roda sempre como **dois processos**: um inicializador e o Python filho. Matar só o PID retornado pelo `spawn` deixaria o filho baixando.

No Windows, matar só o processo pai deixa os filhos órfãos: o ffmpeg chamado pelo yt-dlp continua rodando e segurando arquivos. Isso foi visto na prática na fase 0, com o próprio Electron.

## Interface
| Função | Retorno |
|---|---|
| `run(bin, args, opts)` | `RunHandle { pid, done, kill() }` |
| `killTree(pid)` | `Promise<void>` |
| `execCapture(bin, args, timeoutMs?)` | `{ code, stdout, stderr }` |
| `childEnv(extra?)` | env para subprocessos |

## Dependências
`node:child_process`. Sem bibliotecas externas.

## Testes
`lines.test.ts`: chunks quebrados, `\r\n` dividido entre chunks, linhas vazias, flush.
