# yt-dlp UI

Desktop UI wrapper para yt-dlp + ffmpeg para baixar playlists de música do YouTube. Idioma do projeto e da documentação: português.

- Plano e requisitos: [app/docs/plano.md](app/docs/plano.md)
- Convenções de documentação: [app/docs/README.md](app/docs/README.md)

- Stack: Electron + React + TypeScript (electron-vite, Zustand, Tailwind v4). Código em `app/`.
- Comandos (em `app/`): `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, `npm run dist` (pasta + portable), `npm run dist:installer`.
- Não deixe o terminal com o diretório atual dentro de `app/dist` (trava o `npm run dist` com EBUSY).

## Regras
- Toda implementação deve vir acompanhada de documentação em `app/docs/` (módulo em `modulos/`, dependências em `dependencias.md`, ADR para decisões relevantes, status da fase em `plano.md`), conforme `app/docs/README.md`.
