# Módulo: empacotamento (executável)

> Arquivos: `electron-builder.yml`, `package.json` (scripts `dist`, `dist:installer`, `icon`), `scripts/make-icon.ps1`, `build/icon.png`, `src/main/index.ts` (instância única, AUMID, `YTUI_USER_DATA`)
> Fase: 8

## Como gerar
```bash
npm run dist            # dist/win-unpacked/ (pasta) + dist/yt-dlp UI-<versão>-portable.exe
npm run dist:installer  # dist/yt-dlp UI-<versão>-setup.exe (instalador NSIS)
npm run icon            # regera build/icon.png (512×512) — opcional
```

| Saída | Tamanho | Início (medido) | Quando usar |
|---|---|---|---|
| **`win-unpacked\yt-dlp UI.exe`** (pasta) | 358 MB | **1,7 s** | **Recomendado para uso pessoal.** Copie a pasta para onde quiser e crie um atalho para o `.exe` |
| `…-portable.exe` (arquivo único) | 105 MB | ~12 s | Levar num pendrive. A cada execução extrai tudo para `%TEMP%\yt-dlp-ui-portable` |
| `…-setup.exe` (instalador) | 116 MB | ~2 s (depois de instalado) | Atalhos no Menu Iniciar e na Área de Trabalho, desinstalador. Escolhe a pasta de instalação |

**Avisos:**
- **SmartScreen:** os executáveis **não são assinados** (`no code signing certificate`). Na primeira execução o Windows pode mostrar "O Windows protegeu o computador" → "Mais informações" → "Executar assim mesmo".
- **Tamanho:** as dependências externas (yt-dlp, deno, ffmpeg) **não** vão no executável. O app as baixa na primeira execução (painel ⚙), e o yt-dlp pode ser atualizado sem gerar um executável novo.

## O que vai no pacote
- **Conteúdo:** só `out/` (build do electron-vite) e `package.json`, dentro de `app.asar`.
- **Sem `node_modules`:** o main usa apenas módulos embutidos (`electron`, `node:*`, inclusive `node:sqlite`), e a UI (React, Zustand, TanStack) já sai empacotada pelo Vite. Por isso essas bibliotecas estão em `devDependencies`.

## Comportamentos do app empacotado
- **Dados:** ficam em `%APPDATA%\yt-dlp UI\` (`settings.json`, `app.db`, `bin\`, `logs\`), os mesmos do `npm run dev`. Dev e executável compartilham fila, cache e configurações.
- **`YTUI_USER_DATA`:** essa variável de ambiente troca a pasta de dados. Usada para testar a "primeira execução" sem tocar nos dados reais, ou para manter perfis separados.
- **Instância única:** abrir o app de novo traz a janela existente para frente, em vez de abrir uma segunda cópia que disputaria a fila e o banco.
- **Notificações do Windows** precisam de um *AppUserModelId*:
  - **instalado** (detectado pelo `Uninstall yt-dlp UI.exe` ao lado do `.exe`): `com.ytdlpui.app`, registrado pelo atalho do instalador;
  - **dev, portable, pasta:** o caminho do executável (sem atalho, é o que funciona).
- **Ícone:** `build/icon.png` (nota musical + seta), convertido pelo electron-builder em `.ico`.

## Validação (2026-11-11, executáveis reais, pasta de dados nova via `YTUI_USER_DATA`)
| Caso | Resultado |
|---|---|
| 1ª execução (portable) | yt-dlp e deno "ausentes", ffmpeg do sistema detectado; painel ⚙ **abre sozinho** com "●" |
| Instalar yt-dlp / deno / **ffmpeg** pelo app | 7 s / 5 s / 12 s. O **ffmpeg foi testado pela primeira vez**: zip baixado, só `ffmpeg.exe` + `ffprobe.exe` extraídos, temporários removidos |
| "atualizar" yt-dlp | "yt-dlp is up to date (stable@2026.10.26)" |
| Download pelo executável | `.opus` com capa 360×360, usando o ffmpeg **gerenciado** |
| Abrir uma 2ª instância (portable) | Sai sozinha, sem duplicar processos. Leva ~30 s no portable por causa da extração |
| Notificação na versão em pasta | `[notify] exibida: Downloads concluídos` |
| Tempo de início | portable ~12 s; pasta 1,7 s |
| Instalador | **Gerado, mas não instalado** nos testes (instalaria atalhos e registros no Windows do usuário) |

## Armadilhas
- **`EBUSY … rmdir dist\win-unpacked`:** algum processo (ou um terminal com o diretório atual lá dentro) está segurando a pasta. Feche o app e saia da pasta antes de rodar `npm run dist`.
- **`ELECTRON_RUN_AS_NODE`:** se estiver definida no ambiente, até o executável empacotado roda como Node puro e não abre a janela. Ver [dependencias.md](../dependencias.md#armadilhas-conhecidas).
