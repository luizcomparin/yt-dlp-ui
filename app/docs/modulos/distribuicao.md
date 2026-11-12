# Módulo: distribuição (GitHub Releases + Pages)

> Arquivos: `.github/workflows/release.yml`, `.github/workflows/ci.yml`, `.github/workflows/pages.yml`, `site/index.html`, `README.md` e `LICENSE` (raiz), `electron-builder.yml` (`artifactName`), `package.json` (script `dist:release`, `engines`), `.nvmrc`
> Fase: pós-8 · Decisão: [ADR 0003](../decisoes/0003-distribuicao-github.md)

## Responsabilidade
Publicar o app para qualquer pessoa, **sem custo**: executáveis gerados pelo GitHub Actions e anexados a um GitHub Release, e uma página pública (GitHub Pages) com botão de download direto. Não cuida de atualização automática do app (ver Notas).

## Fluxo

**Release** (`release.yml`, ao enviar uma tag `v*`):
1. Máquina `windows-latest`, Node da versão em `app/.nvmrc`.
2. Confere se a tag é igual a `v` + `version` do `package.json`; se não for, falha.
3. `npm ci` → `npm run typecheck` → `npm test` → `npm run dist:release` (instalador NSIS + portátil, `--publish never`).
4. `softprops/action-gh-release` cria o release com notas automáticas e anexa `yt-dlp-ui-setup.exe` e `yt-dlp-ui-portable.exe`.

**CI** (`ci.yml`): typecheck e testes a cada push na `main` ou PR que mexa em `app/`.

**Página** (`pages.yml`, push na `main` que mexa em `site/`, ou manual):
1. Copia `app/build/icon.png` para `site/icon.png`.
2. Publica a pasta `site/` no GitHub Pages: `https://luizcomparin.github.io/yt-dlp-ui/`.
3. No navegador, a página consulta `api.github.com/repos/<repo>/releases/latest` para mostrar versão, data e tamanho. Sem release (404), os botões levam para a lista de releases.

**Link permanente de download:** como os arquivos têm nome fixo, `https://github.com/luizcomparin/yt-dlp-ui/releases/latest/download/yt-dlp-ui-setup.exe` sempre baixa a versão mais recente. Usado na página e no README.

## Publicar uma versão
```bash
cd app
npm version 0.2.0 --no-git-tag-version   # package.json + package-lock.json
git commit -am "v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```
`npm version` sem a flag não cria a tag aqui, porque o `package.json` não está na raiz do repositório.

## Configuração única no GitHub
- **Settings → Pages → Build and deployment → Source: GitHub Actions.** Sem isso o `pages.yml` falha.
- Repositório **público**: Releases e Pages de repo privado não ficam acessíveis ao público (ou exigem plano pago).
- Nenhum segredo é necessário: o `GITHUB_TOKEN` padrão tem `contents: write` pelo `permissions` do workflow.

## Dependências
| Ferramenta | Para quê |
|---|---|
| GitHub Actions (runners `windows-latest` / `ubuntu-latest`) | Build, testes e deploy. Gratuito e ilimitado para repositórios públicos |
| `actions/checkout`, `actions/setup-node` | Código e Node no runner |
| `softprops/action-gh-release` | Criar o release e anexar os `.exe` |
| `actions/configure-pages`, `upload-pages-artifact`, `deploy-pages` | Publicar `site/` no Pages |
| API REST do GitHub (sem token) | Versão do último release na página (limite de 60 req/h por IP; se estourar, só a linha de versão some) |

## Erros e casos de borda
- **Tag × versão diferentes:** o release falha no passo de conferência, antes do build.
- **Tag reenviada:** o `action-gh-release` atualiza o release existente e substitui os arquivos de mesmo nome.
- **Builds locais** também geram `yt-dlp-ui-setup.exe` / `yt-dlp-ui-portable.exe`, sem versão no nome. A versão aparece nas propriedades do arquivo e no release.
- **Assinatura:** `CSC_IDENTITY_AUTO_DISCOVERY=false` impede o electron-builder de procurar certificado. O SmartScreen avisa na primeira execução; README e página explicam como prosseguir.

## Notas
- **Atualização automática do app** (`electron-updater`) ficou de fora: exigiria levar `node_modules` no executável ([empacotamento](empacotamento.md)). O yt-dlp continua sendo atualizado pelo próprio app.
- **Print na página:** basta adicionar `site/screenshot.png`. Sem o arquivo, o bloco de imagem é removido.
