# Arquitetura

## Processos do Electron

```
┌───────────────────────────────┐   IPC (invoke / eventos)   ┌──────────────────────────────┐
│ Renderer (UI)                 │ ─────────────────────────▶ │ Main (Node)                  │
│ React + Zustand + Tailwind    │ ◀───────────────────────── │ ipc.ts → módulos do backend  │
│ src/renderer/src              │      window.api.*          │ src/main                     │
└───────────────────────────────┘                            └──────────────┬───────────────┘
              ▲                                                             │ spawn
              │ contextBridge                                               ▼
┌─────────────┴─────────────────┐                            ┌──────────────────────────────┐
│ Preload  src/preload          │                            │ yt-dlp.exe / ffmpeg / deno   │
│ expõe só `window.api`         │                            │ (subprocessos)               │
└───────────────────────────────┘                            └──────────────────────────────┘
```

- **Main:** tem acesso total a Node e ao sistema. Concentra toda a lógica: processos, fila, banco, arquivos.
- **Preload:** a única ponte. Expõe uma API mínima e tipada em `window.api`. Roda com `contextIsolation: true`.
- **Renderer:** só UI. Não tem acesso a Node (`nodeIntegration: false`).
- **`src/shared/ipc.ts`:** o contrato de IPC (nomes de canais + tipos), importado pelos três lados via alias `@shared`.

## Estrutura de pastas

```
app/
├─ docs/                       documentação (ver README.md)
├─ scripts/electron-vite.mjs   wrapper do CLI (remove ELECTRON_RUN_AS_NODE)
├─ src/
│  ├─ main/       index.ts (janela, ciclo de vida), ipc.ts (handlers) + módulos do backend
│  ├─ preload/    index.ts (window.api)
│  ├─ renderer/   index.html + src/ (React)
│  └─ shared/     tipos e contratos compartilhados
├─ electron.vite.config.ts
├─ electron-builder.yml
└─ tsconfig.{json,node.json,web.json}
```

## Módulos do backend (`src/main/`)

| Módulo | Pasta | Doc | Fase |
|---|---|---|---|
| app-shell | `index.ts`, `ipc.ts`, `events.ts`, `paths.ts` | [app-shell](modulos/app-shell.md) | 0 |
| settings (+ presets, cookies) | `settings/` | [settings](modulos/settings.md) | 1, 6 |
| deps | `deps/` | [deps](modulos/deps.md) | 1 |
| runner | `runner/` | [runner](modulos/runner.md) | 1 |
| ytdlp (args/parser) | `ytdlp/` | [ytdlp-args](modulos/ytdlp-args.md) | 1 |
| db | `db/` | [db](modulos/db.md) | 2 |
| playlist (o "metadata" do plano) | `playlist/` | [playlist](modulos/playlist.md) | 2 |
| substituir faixa | `playlist/replace.ts` | [replace](modulos/replace.md) | pós-8 |
| queue (fila de download) | `queue/` | [queue](modulos/queue.md) | 4 |
| errors (log de erros) | `errors/` | [errors](modulos/errors.md) | 5 |
| console | `console/` | [console](modulos/console.md) | 6 |
| library (downloads, pasta, M3U) | `library/` | [extras](modulos/extras.md) | 7 |
| system (clipboard, notificações) | `system/` | [extras](modulos/extras.md) | 7 |
| empacotamento (executável, instância única) | `index.ts`, `electron-builder.yml` | [empacotamento](modulos/empacotamento.md) | 8 |

## Código compartilhado (`src/shared/`)

| Arquivo | Conteúdo |
|---|---|
| `ipc.ts` | Contrato de IPC: canais, tipos (`Track`, `Settings`…) |
| `tracks.ts` | Regras puras de ordenação, filtro e escolha de formato, usadas pela UI e pelo main ([ui-playlist](modulos/ui-playlist.md)) |
| `m3u.ts`, `duplicates.ts` | Geração de M3U e chave de nome para duplicadas ([extras](modulos/extras.md)) |
| `presets.ts` | Regras puras dos presets ([settings](modulos/settings.md#presets)) |
| `csv.ts` | Geração de CSV para o Excel pt-BR ([errors](modulos/errors.md)) |
| `antiblock.ts` | Perfis anti-bloqueio e escada de espera ([queue](modulos/queue.md#anti-bloqueio-r13)) |

## UI (`src/renderer/src/`)

| Parte | Doc |
|---|---|
| Tabela de faixas, seleção, ordenação, filtros, formato, layout | [ui-playlist](modulos/ui-playlist.md) |
| Painel da fila, status por faixa | [queue](modulos/queue.md) |
| Tela de erros (falhas + indisponíveis, CSV) | [errors](modulos/errors.md) |
| Console (`>_`) | [console](modulos/console.md) |
| M3U, aviso do clipboard, marcas de duplicada | [extras](modulos/extras.md) |
| Substituir faixa indisponível | [replace](modulos/replace.md) |
| Configurações, presets, cookies | [settings](modulos/settings.md) |
| Dependências e configurações | [deps](modulos/deps.md) |

Todos os módulos do plano estão implementados. A classificação de erros já existe em `ytdlp/errors.ts` e será expandida na fase 5.

## Fluxo de carregamento de playlist (fase 2)

```
UI (Carregar) ─invoke playlist:load─▶ playlist/service
                                        ├─ db: cache → faixas imediatas
                                        ├─ list.ts: yt-dlp --flat-playlist ──▶ db ──▶ faixas
                                        └─ enrich.ts: 2× yt-dlp (lotes de 10) ──▶ db ──▶ faixas atualizadas
UI store (zustand) ◀── playlist:event (info/tracks/listed/enrich-progress/enriched/warning/error)
```

## Fluxo de um download (fase 4)

```
UI (Baixar selecionadas / ↓) ─invoke queue:add─▶ queue/manager (fila persistida em SQLite)
                                                   │ tick(): até N simultâneos (perfil anti-bloqueio)
                                                   │ archive? → skipped
                                                   │ ytdlp/args.buildDownloadArgs (+archive, +anti-bloqueio)
                                                   ▼
                                               runner.run(yt-dlp) ──linhas──▶ ytdlp/parse
                                                   │ ao sair: queue/policy.decideOutcome
UI stores (zustand) ◀── queue:event (jobs/removed/state/archived)
```

Os dados do app ficam em `%APPDATA%\yt-dlp UI\`, com `settings.json`, `app.db` (SQLite), `bin/` e `logs/` (erros em JSONL).

## Como adicionar um canal IPC

1. Declarar o nome em `IpcChannels` e os tipos em `src/shared/ipc.ts`.
2. Registrar o handler em `src/main/ipc.ts`.
3. Expor em `src/preload/index.ts` (o objeto `api` é tipado por `RendererApi`).
4. Usar via `window.api.<metodo>()` no renderer.

Eventos contínuos do main para o renderer, como o progresso de download, vão usar `webContents.send` + `ipcRenderer.on`, também declarados no contrato.
