# Módulo: app-shell (esqueleto)

> Arquivos: `src/main/index.ts`, `src/main/ipc.ts`, `src/preload/index.ts`, `src/shared/ipc.ts`, `src/renderer/*`
> Fase: 0

## Responsabilidade
Inicia o app, cria a janela, registra os handlers de IPC e carrega a UI. Não contém lógica de negócio.

## Fluxo
1. `app.whenReady()` → define o `AppUserModelId` (exigido para notificações no Windows) → `registerIpcHandlers()` → `createWindow()`.
2. A janela carrega:
   - **em dev:** a URL do dev server do Vite (`ELECTRON_RENDERER_URL`, com hot reload);
   - **em produção:** `out/renderer/index.html`.
3. O preload expõe `window.api`. O renderer chama `window.api.getAppInfo()` → `ipcMain.handle('app:info')` → retorna as versões. Elas aparecem no rodapé e servem de teste ponta a ponta do IPC.
4. Links externos (`window.open`) são abertos no navegador padrão, nunca dentro do app.

## Interface
| Canal IPC | Parâmetros | Retorno |
|---|---|---|
| `app:info` | — | `AppInfo { name, version, electron, node, chrome, platform }` |

## Segurança
- `contextIsolation: true`, `nodeIntegration: false`.
- `sandbox: false` para o preload poder importar módulos compartilhados. A UI não tem acesso a Node.
- CSP no `index.html`: scripts só locais; imagens também de `i.ytimg.com` e `*.ggpht.com`/`*.googleusercontent.com` (thumbnails do YouTube).

## Dependências
`electron`, `electron-vite`, `react`, `react-dom`, `tailwindcss`. Ver [dependencias.md](../dependencias.md).

## Comandos
| Comando | O que faz |
|---|---|
| `npm install` | Instala dependências e baixa o binário do Electron (`postinstall`) |
| `npm run dev` | Abre o app com hot reload |
| `npm run typecheck` | Checa os tipos de main/preload e do renderer |
| `npm run build` | Gera `out/` |
| `npm run dist` | Gera o executável portable em `dist/` |
