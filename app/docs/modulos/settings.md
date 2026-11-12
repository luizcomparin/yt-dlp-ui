# Módulo: settings (configurações, presets e cookies)

> Arquivos:
> - main: `src/main/settings/store.ts`, `ytdlp/args.ts` (`cookieArgs`), `console/index.ts` (`testCookies`)
> - compartilhado: `src/shared/presets.ts` (+ teste), tipos `Settings`, `Preset`, `PRESET_KEYS` em `ipc.ts`
> - UI: `store/settings.ts`, `components/SettingsPanel.tsx`
>
> Fases: 1 (base), 6 (presets, cookies, evento de mudança) · Requisitos: R12 (cookies)

## Configurações (`%APPDATA%\yt-dlp UI\settings.json`)
| Campo | Padrão | Uso |
|---|---|---|
| `outputDir` | `Música\yt-dlp-ui` | Pasta de destino (e do archive) |
| `outputTemplate` | `%(title)s.%(ext)s` | Nome do arquivo |
| `cropThumbnail` | `true` | Capa quadrada |
| `audioFormat` | `best` | `best` / `opus` / `m4a` |
| `numberFiles` | `false` | Prefixo `001 - ` |
| `antiBlock` | `safe` | Perfil anti-bloqueio |
| `limitRate` | `""` | `--limit-rate` |
| `extraArgs` | `""` | Argumentos extras do yt-dlp |
| `cookiesBrowser` | `""` | Navegador para `--cookies-from-browser` |
| `cookiesProfile` | `""` | Perfil do navegador (opcional) |
| `cookiesFile` | `""` | Arquivo `cookies.txt` (usado se não houver navegador) |
| `presets` | `[]` | Presets salvos |
| `autoM3u` | `true` | Gerar `.m3u8` ao terminar a fila |
| `orderFileDates` | `true` | Ao gerar o M3U, datas dos arquivos na ordem da playlist |
| `clipboardWatch` | `true` | Avisar ao copiar link do YouTube |
| `notifyOnFinish` | `true` | Notificações do sistema |
| `ffmpegPath` | `null` | ffmpeg customizado |
| `ytdlpChannel` | `stable` | Canal de atualização do yt-dlp |

**Fluxo de alteração:**
- **Leitura:** `getSettings()` lê uma vez e completa com os padrões. Assim, campos novos de versões futuras aparecem sozinhos.
- **Gravação:** `updateSettings(patch)` grava o arquivo **e emite `settings:changed`** para todas as janelas. O store da UI sempre reflete o arquivo, qualquer que seja a origem da mudança. Esse evento foi criado depois que um teste mostrou a UI desatualizada quando a mudança vinha de fora dela.
- **Campos de texto da UI:** são não controlados (salvam ao sair do campo). Eles têm `key` com o valor atual, para serem recriados quando um preset ou outra origem muda o valor.

## Presets
- **O que guardam** (`PRESET_KEYS`): formato, capa, nome do arquivo, numeração, perfil anti-bloqueio, limite e argumentos extras.
- **O que fica de fora:** pasta de destino, cookies e caminhos de ferramentas. Um preset muda **como** baixar, não **onde**, nem com qual conta.
- **"salvar…":** pede um nome. Se o nome já existir (ignorando maiúsculas), o preset é sobrescrito.
- **Seletor:** mostra o preset cujos valores batem com a configuração atual (`matchingPreset`), ou "(configuração personalizada)".
- **Aplicar:** grava os valores do preset nas configurações. "excluir" remove o preset ativo.

## Cookies (R12)
- **Para que servem:** vídeos com restrição de idade, privados da própria conta e conteúdo de membros.
- **Opções:**
  - **Navegador** → `--cookies-from-browser <nav>[:<perfil>]`;
  - **Arquivo** → `--cookies <arquivo>`. O navegador tem prioridade.
- **Onde são aplicados:** listagem, enriquecimento, downloads e console (com "usar config. do app").
- **"testar"** (`cookies:test`): roda `yt-dlp --simulate --print "ok %(id)s"` num vídeo público com os cookies e traduz as falhas comuns:

| Erro | Dica mostrada |
|---|---|
| `could not copy`, `database is locked` | Feche o navegador |
| `decrypt`, `DPAPI`, `app-bound` | Chrome/Edge recentes criptografam os cookies de um jeito que o yt-dlp não lê. Use o Firefox ou um `cookies.txt` |
| `could not find …` | Navegador ou perfil não encontrado |

**Avisos na UI:**
- Para Chrome/Edge: podem falhar, sendo o Firefox o recomendado.
- Para todos: muitas requisições com a própria conta podem levar a bloqueio da conta.

## Validação (2026-11-11)
| Caso | Resultado |
|---|---|
| Sem cookies → testar | "Nenhum navegador ou arquivo de cookies configurado." |
| Firefox (não instalado) | "could not find firefox cookies database in … — Navegador ou perfil não encontrado." |
| Arquivo `cookies.txt` (fictício) | "Cookies funcionando." O console passou a incluir `--cookies` |
| Preset salvo pela UI (m4a, capa original, numeração) → mudar config. → aplicar | Valores restaurados; seletor mostra o preset ativo |

**Não testado com os cookies reais dos navegadores do usuário** (Chrome, Edge e Brave estão instalados). Isso enviaria a sessão da conta dele ao YouTube sem pedido explícito. O teste fica a cargo do usuário, pelo botão "testar".
