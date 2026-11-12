# Dependências

> Atualize este arquivo sempre que entrar ou sair uma dependência.

## Ferramentas externas (binários)

| Ferramenta | Para quê | Como é obtida | Fase |
|---|---|---|---|
| `yt-dlp.exe` | Metadados e download. O executável oficial já inclui `mutagen` e os scripts `yt-dlp-ejs` | Baixado pelo app ([deps](modulos/deps.md)) | 1 |
| `ffmpeg` / `ffprobe` | Extração de áudio, embed e crop da capa | PATH do sistema (WinGet), caminho customizado ou baixado pelo app | 1 |
| `deno` | Runtime JS que o yt-dlp exige para o YouTube (`--js-runtimes deno:<caminho>`) | Baixado pelo app | 1 |
| `tar.exe` (Windows) | Extrair os zips do deno e do ffmpeg | Já vem no Windows 10+ | 1 |

Os binários baixados ficam em `%APPDATA%\yt-dlp UI\bin\`.

## npm: runtime

| Pacote | Para quê |
|---|---|
| `react`, `react-dom` | UI. Em `devDependencies`: o Vite empacota na UI, e o executável não precisa de `node_modules` ([empacotamento](modulos/empacotamento.md)) |
| `zustand` | Estado global da UI (fila, faixas, progresso) com seletores |
| `@tanstack/react-virtual` | Virtualização da tabela de faixas (só renderiza as linhas visíveis) |
| `node:sqlite` (embutido) | Banco local: cache de playlists e vídeos. Não é pacote npm, vem no Node do Electron ([ADR 0002](decisoes/0002-sqlite.md)) |

## npm: desenvolvimento e build

| Pacote | Para quê |
|---|---|
| `electron` | Runtime desktop. **A partir da v45 o binário não é baixado automaticamente**: o script `postinstall` roda `install-electron` |
| `electron-vite` | Dev server + build de main, preload e renderer (config em `electron.vite.config.ts`) |
| `vite`, `@vitejs/plugin-react` | Bundler e suporte a React/JSX com hot reload |
| `tailwindcss`, `@tailwindcss/vite` | Estilos utilitários (v4, configurado via `@import 'tailwindcss'` no CSS) |
| `typescript`, `@types/*` | Tipagem (`npm run typecheck`) |
| `electron-builder` | Gera a pasta, o portable e o instalador (`npm run dist`, `npm run dist:installer`; config em `electron-builder.yml`) |
| `vitest` | Testes unitários das funções puras (`npm test`, config em `vitest.config.mts`) |

## Publicação (GitHub)

| Ferramenta | Para quê |
|---|---|
| GitHub Actions | CI (typecheck + testes), build dos executáveis e deploy da página. Gratuito para repo público ([distribuição](modulos/distribuicao.md)) |
| `softprops/action-gh-release` | Cria o release e anexa os `.exe` |
| GitHub Pages | Hospeda a página pública (`site/`) |

Versão do Node para desenvolvimento: **22.5+** (`engines` no `package.json`), recomendada **24** (`.nvmrc`, a mesma usada no CI).

## Armadilhas conhecidas

- **Encoding da saída do yt-dlp no Windows:** com stdout em pipe, o yt-dlp usa a code page do console e descarta caracteres não ASCII (títulos em coreano, japonês, emoji…). `PYTHONUTF8=1` **não** basta: é preciso passar `--encoding utf-8`. Para o caminho final, o app usa `%(filepath)j` (JSON com escapes).
- **`node:sqlite` nos testes:** o Node do sistema (22.12) exige `--experimental-sqlite`; o `vitest.config.mts` adiciona a flag automaticamente. O Electron não precisa dela.
- **`tar` do Git Bash × `tar.exe` do Windows:** o do Git Bash não abre `.zip`. O app chama explicitamente `%SystemRoot%\System32\tar.exe`.

- **`ELECTRON_RUN_AS_NODE`:** se essa variável estiver definida no ambiente (ex.: processos iniciados pelo VS Code ou por extensões), o Electron roda como Node puro e o app quebra com `Cannot read properties of undefined (reading 'whenReady')`. Por isso `npm run dev` e `npm run preview` passam por `scripts/electron-vite.mjs`, que remove a variável.
