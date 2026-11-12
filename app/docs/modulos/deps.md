# Módulo: deps

> Arquivos: `src/main/deps/index.ts`, `src/main/deps/download-file.ts`
> Fase: 1 · UI: `components/DepsPanel.tsx`, `store/deps.ts`

## Responsabilidade
Localizar, verificar (versão), baixar e atualizar os binários externos: **yt-dlp**, **ffmpeg** (+ffprobe) e **deno**. Não executa downloads de música.

## Fluxo

**Localização** (`locate`), na ordem:
1. Caminho customizado (`settings.ffmpegPath`, só para o ffmpeg; aceita arquivo ou pasta).
2. Binário gerenciado em `%APPDATA%\yt-dlp UI\bin\`.
3. PATH do sistema (`where.exe`).

**Status** (`getDepStatus`): localiza o binário e roda `--version` (ou `-version` no ffmpeg). Retorna `{ installed, path, version, source }`.

**Instalação** (`installDep`):
1. Baixa do GitHub (releases "latest") para a pasta gerenciada. O download vai para um arquivo `.download` e só é renomeado no fim.
2. Se for zip (deno, ffmpeg), extrai com o `tar.exe` do Windows numa pasta temporária, move só os `.exe` necessários e apaga o resto.
3. Emite `deps:progress` (`downloading` → `extracting` → `done`/`error`).
4. Chamadas simultâneas para a mesma dependência reaproveitam a mesma promise.

**Atualização do yt-dlp** (`updateYtdlp`): roda `yt-dlp --update-to <stable|nightly>`. Funciona só para o binário gerenciado; um yt-dlp do sistema deve ser atualizado por quem o instalou.

**Para os downloads** (`resolveToolPaths`):
- Devolve o caminho do yt-dlp, a **pasta** do ffmpeg (o yt-dlp acha o ffprobe ao lado) e o caminho do deno (opcional).
- Lança erro se o yt-dlp ou o ffmpeg faltarem.

## Fontes
| Dependência | URL |
|---|---|
| yt-dlp (stable) | `github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe` |
| yt-dlp (nightly) | `github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp.exe` |
| deno | `github.com/denoland/deno/releases/latest/download/deno-x86_64-pc-windows-msvc.zip` |
| ffmpeg | `github.com/yt-dlp/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip` |

**Instalar tudo** (UI): quando falta alguma dependência, o painel mostra o botão **Instalar tudo**, que chama `deps:install` em paralelo para cada uma que falta (`installAll` em `store/deps.ts`). Os erros de cada instalação são juntados na mensagem do painel; as que deram certo continuam instaladas.

## Interface (IPC)
| Canal | Parâmetros | Retorno |
|---|---|---|
| `deps:status` | — | `DepStatus[]` |
| `deps:install` | `DepName` | `DepStatus` |
| `deps:update-ytdlp` | — | `{ output, status }` |
| `deps:progress` (evento) | — | `DepsProgress` |

## Dependências
`fetch` nativo do Node, `tar.exe` do Windows (bsdtar; o `tar` do Git Bash **não** abre zip), runner (`execCapture`).

## Erros e casos de borda
- Instalação automática só no Windows.
- Se `--version` falhar, o status vem com `installed: false` e `error` (ex.: binário corrompido).
- Testado: instalação de yt-dlp e deno pelo app. **A instalação do ffmpeg não foi testada**, porque a máquina de desenvolvimento usa o do WinGet. O caminho de código é o mesmo do deno (zip), só que move dois arquivos.
