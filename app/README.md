# yt-dlp UI

UI desktop (Electron + React + TypeScript) para yt-dlp + ffmpeg, focada em baixar playlists de música do YouTube na melhor qualidade de áudio, com capa embutida.

## Usar o executável

```bash
npm install
npm run dist
```

Depois, abra **`dist\win-unpacked\yt-dlp UI.exe`**. A pasta inteira pode ser copiada para qualquer lugar; crie um atalho para o `.exe`.

Alternativas:
- **Arquivo único:** `dist\yt-dlp UI-<versão>-portable.exe` (abre mais devagar).
- **Instalador:** `npm run dist:installer` gera `dist\yt-dlp UI-<versão>-setup.exe`, com atalhos e desinstalador.

Os executáveis não são assinados. Se o Windows mostrar "O Windows protegeu o computador", clique em "Mais informações" → "Executar assim mesmo".

## Desenvolvimento

```bash
npm install     # também baixa o binário do Electron
npm run dev     # abre o app com hot reload
npm test        # testes unitários
npm run typecheck
```

## Primeiro uso
1. **Dependências:** o painel ⚙ abre sozinho se faltar algo. Clique em **instalar** no yt-dlp e no deno; o ffmpeg é detectado no PATH ou pode ser instalado pelo mesmo painel.
2. **Pasta de destino:** padrão `Música\yt-dlp-ui`.
3. **Carregar:** cole o link da playlist e clique em **Carregar**. As faixas aparecem na hora; datas e tamanhos chegam aos poucos.
4. **Escolher:** ordene, filtre, selecione e clique em **Baixar selecionadas**.

Os dados do app (configurações, cache, fila, logs, binários) ficam em `%APPDATA%\yt-dlp UI\`.

## Documentação

Ver [docs/README.md](docs/README.md). O plano completo está em [docs/plano.md](docs/plano.md).
