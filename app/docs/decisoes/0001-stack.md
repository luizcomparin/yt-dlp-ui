# ADR 0001: Escolha da stack

- **Status:** aceita (Electron + React + TypeScript)
- **Data:** 2026-11-10

## Contexto

- **Desenvolvedor:** experiência em JavaScript e já trabalhou com Electron. Não conhece Python/Qt.
- **O que o app precisa fazer:**
  - executar e matar processos (yt-dlp, ffmpeg, deno);
  - ler o stdout em tempo real;
  - abrir o diálogo nativo de escolha de pasta;
  - monitorar a área de transferência;
  - mostrar notificações do sistema;
  - usar SQLite.
- **Distribuição:** uso pessoal, com `npm run dev` ou executável.

## Opções

### A. Arquivo `.html` local (abrir direto no navegador)
Um HTML aberto via `file://` **não consegue executar processos** nem acessar o disco livremente. Para funcionar, precisaria de um servidor por trás, o que o transforma na opção B. **Descartada.**

### B. Servidor Node local + UI no navegador
O backend é Node (Express/Fastify + `child_process`) e a UI é feita com Vite e aberta em `localhost`.

**Prós:**
- 100% JS, sem framework desktop.
- Debug no DevTools.
- `npm run dev` simples.

**Contras:**
- **Sem diálogo nativo de pasta:** seria preciso digitar o caminho ou criar um "file browser" próprio.
- **Clipboard e notificações:**
  - O monitor de área de transferência roda no Node, com bibliotecas como `clipboardy`.
  - As notificações dependem do navegador ou de bibliotecas como `node-notifier`.
- **Sem janela própria:** o app vive numa aba que pode ser fechada por engano.
- **Executável:** sai improvisado (pkg / Node SEA).

### C. Electron
Node completo no processo principal e UI web (Vite + framework à escolha) no renderer.

**Prós:**
- Você já conhece.
- 100% JS/TS.
- APIs nativas prontas: `dialog`, `clipboard`, `Notification`, tray.
- `child_process` com controle total.
- `electron-vite` dá `npm run dev` com hot reload.
- `electron-builder` gera um portable `.exe` ou um instalador.

**Contras:**
- Executável grande (~100–150 MB) e uso de RAM maior.
- Módulos nativos (`better-sqlite3`) exigem rebuild para a versão do Electron. O `electron-builder` faz isso automaticamente.

### D. Tauri v2
UI web, com o backend em **Rust**.

**Prós:**
- Executável pequeno (~10 MB) e pouca RAM.
- Plugins oficiais de shell, sidecar, clipboard, notificação e dialog.

**Contras:**
- **Lógica não trivial em Rust:** fila, kill de árvore de processo e parsing ficariam em Rust ou espalhados em chamadas de plugin.
- **Toolchain extra:** é preciso instalar Rust e MSVC.
- Curva de aprendizado alta para quem é de JS.

### E. Python + PySide6 (Qt)
UI nativa Qt e backend Python.

**Prós:**
- Mesmo ecossistema do yt-dlp.
- Executável via PyInstaller.

**Contras:**
- Linguagem e framework novos para você.
- UI em widgets Qt, que dão menos liberdade visual que HTML/CSS para quem vem da web.

## Comparação

| Critério | B. Node + browser | C. Electron | D. Tauri | E. PySide6 |
|---|---|---|---|---|
| Familiaridade (dev JS) | ✅ alta | ✅ alta | ⚠️ média (Rust) | ❌ baixa |
| Spawn/kill/stream de processos | ✅ | ✅ | ⚠️ via plugin/Rust | ✅ |
| Diálogo de pasta, clipboard, notificação | ⚠️ improvisado | ✅ nativo | ✅ plugins | ✅ nativo |
| `npm run dev` | ✅ | ✅ | ✅ (`tauri dev`) | ❌ (`python main.py`) |
| Executável | ⚠️ improvisado | ✅ portable/instalador | ✅ pequeno | ✅ PyInstaller |
| Tamanho/RAM | ✅ leve | ❌ pesado | ✅ leve | ⚠️ médio |
| Esforço total | médio | **baixo** | alto | alto |

## Recomendação

**C. Electron + TypeScript**, com esta stack sugerida:

| Peça | Escolha |
|---|---|
| Scaffold, dev e build | `electron-vite` (main, preload e renderer com hot reload) |
| UI | React ou Vue (escolha do dev) + uma tabela virtualizada, para playlists grandes |
| Banco de dados | `better-sqlite3` |
| Executável | `electron-builder` (target `portable` ou `nsis`) |
| Processos | `child_process.spawn` + `taskkill /T /F` para matar a árvore no Windows |

O tamanho do executável não importa para uso pessoal. Todo o resto favorece o Electron: você já conhece, é só JS e as APIs nativas já vêm prontas.

## Decisão

**Aceita em 2026-11-10: Electron + React + TypeScript.**

- **Por que React e não Vue:** o desenvolvedor vem de Angular e já usou React uma vez. React tem o maior ecossistema de exemplos para Electron.
- **Desempenho da tabela:** a atualização frequente de progresso é tratada com estado em **Zustand** e seletores por faixa, para não re-renderizar a tabela inteira.

**Consequências:**
- Executável grande (~120 MB). Aceitável para uso pessoal.
- Toda a lógica de processos fica no processo principal (Node). A UI só fala com ela via IPC tipado (`src/shared/ipc.ts`).
- Módulos nativos (ex.: `better-sqlite3`, na fase 2) vão precisar de rebuild para o ABI do Electron.
